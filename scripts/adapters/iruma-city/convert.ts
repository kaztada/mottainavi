import { parseCsv } from "../../core/csv"

/**
 * 埼玉県オープンデータポータル「【入間市】ごみの分別辞典」の CSV(Shift_JIS、2,401品目)を標準形式の CSV にする。
 * 原本の形(カタログ更新 2026-03-17 の版): 見出しは
 * 「識別情報, ごみの分別辞典_全国地方公共団体コード, …_団体名, …_品目, …_品目ふりがな, …_分別区分, …_注意点」の独自7列。
 * 標準形式の先頭5列(コード, ID, 品目, 分別区分, 注意点)に並べ直す(ID は識別情報、ふりがな・団体名は使わない)。
 *
 * 直すのは2つだけ(注意点の文字は変えない):
 * - 品目名の前後の空白を取る(62件。注意点は前後の空白だけ取る)
 * - 品目名のカッコの閉じ忘れ3件を、冊子(ごみチャンネル)の表記に合わせて閉じる。FIXES に無い崩れは直さない
 */
export const EXPECTED_HEADER = [
  "識別情報",
  "ごみの分別辞典_全国地方公共団体コード",
  "ごみの分別辞典_団体名",
  "ごみの分別辞典_品目",
  "ごみの分別辞典_品目ふりがな",
  "ごみの分別辞典_分別区分",
  "ごみの分別辞典_注意点",
]
const CITY_CODE = "112259"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

/** カッコの閉じ忘れ(原文 → 直したあと)。該当の行が無ければ止める */
export const FIXES: Record<string, string> = {
  "足拭きマット（バスマット）（脱衣場用": "足拭きマット（バスマット）（脱衣場用）",
  "泡立て器(調理器具（手動式・電動式）": "泡立て器(調理器具（手動式・電動式）)",
  "池(園芸用（プラスチック製）": "池(園芸用（プラスチック製）)",
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text.replace(/^﻿/, ""))
  const header = rows[0]?.map((h) => h.trim())
  if (
    !header ||
    header.length !== EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(
      `入間市CSVの見出しが想定(${EXPECTED_HEADER.join(", ")})と違います: ${JSON.stringify(header)}`
    )
  }
  const used = new Set<string>()
  const lines = [HEADER.map(quote).join(",")]
  rows.slice(1).forEach((r, i) => {
    const lineNo = i + 2
    if (r.every((c) => !c.trim())) return
    if (r.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `入間市CSVの${lineNo}行目の列数が想定(7列)と違います: ${r.length}列`
      )
    }
    const [id, code, , rawName, , label, rawNote] = r.map((c) => c.trim())
    if (code !== CITY_CODE) {
      throw new Error(`入間市CSVの${lineNo}行目: 市コードが ${CITY_CODE} ではありません: ${code}`)
    }
    let name = rawName
    if (name in FIXES) {
      used.add(name)
      name = FIXES[name]
    }
    if (!name || !label) {
      throw new Error(`入間市CSVの${lineNo}行目: 品目か分別区分が空です`)
    }
    if (name.includes("�")) {
      throw new Error(`入間市CSVの${lineNo}行目: 文字化けがあります: ${name}`)
    }
    const note = rawNote.replace(/\r\n?/g, "\n")
    lines.push([CITY_CODE, id, name, label, note].map(quote).join(","))
  })
  const unused = Object.keys(FIXES).filter((n) => !used.has(n))
  if (unused.length > 0) {
    throw new Error(
      `入間市CSV: FIXES の品目が見つかりません(市が直したか、削除された可能性): ${unused.join(", ")}`
    )
  }
  return lines.join("\n") + "\n"
}
