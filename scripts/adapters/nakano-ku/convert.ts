import { parseCsv } from "../../core/csv"

/**
 * 中野区「ごみ分別一覧」(なかのデータマップの CSV、UTF-8 BOM つき、8列)を標準形式の CSV にする。
 * 原本の形(2026-06 ごろの版):
 * - 列は「ごみの品目, インデックス, 種別, 説明, GIS搭載用住所, 経度, 緯度, 分類」
 * - GIS の3列は全行が区役所の住所と座標で意味が無く、分類は全行「ごみ分別一覧」。どちらも使わない
 * - 品目名の82件に「改行+※別名」(例: 「ソファー⏎※いす」)が付いている → 改行より後ろを外す
 * - ID の列は無い
 *
 * 変換: 品目, 種別, 説明 を標準形式(全国地方公共団体コード, ID, 品目, 分別区分, 注意点)にする。ID は連番。
 * 区が形を変えたときに静かに壊れないよう、前提(見出し・列数・分類・別名の書き方)が崩れたら止める。
 */
export const EXPECTED_HEADER = [
  "ごみの品目",
  "インデックス",
  "種別",
  "説明",
  "GIS搭載用住所",
  "経度",
  "緯度",
  "分類",
]
/** 全行の「分類」の値 */
export const EXPECTED_CLASS = "ごみ分別一覧"
/** 中野区の全国地方公共団体コード */
const WARD_CODE = "131148"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

/** 品目名の書き損じ(意味は変えない。区が直したら当たらなくなるだけ) */
const NAME_FIXES: Record<string, string> = {
  // 閉じかっこの抜け
  "びん（医薬品・化粧品等、飲食用以外のもの":
    "びん（医薬品・化粧品等、飲食用以外のもの）",
  // 「べ」がひらがな
  パイプべッド: "パイプベッド",
  // 「ベッド」の書き損じ(検索で「ベッド」に当たるように)
  二段ベット: "二段ベッド",
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** 品目名から「改行+※別名」を外す。外した別名(「※」を除く)も返す */
export function splitName(raw: string): { name: string; alias: string | null } {
  const [first, ...rest] = raw.split(/\r?\n/)
  const name = first.trim()
  const tail = rest.join("\n").trim()
  if (!tail) return { name: NAME_FIXES[name] ?? name, alias: null }
  if (!tail.startsWith("※") || /\n/.test(tail)) {
    throw new Error(
      `中野区CSVの品目名の改行の後ろが「※別名」の形ではありません: ${JSON.stringify(raw)}`
    )
  }
  return { name: NAME_FIXES[name] ?? name, alias: tail.slice(1).trim() }
}

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text.replace(/^﻿/, "")).filter((r) =>
    r.some((c) => c.trim())
  )
  const header = rows[0]?.map((h) => h.trim())
  if (
    !header ||
    header.length !== EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(
      `中野区CSVの見出しが想定と違います: ${JSON.stringify(header)}`
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  rows.slice(1).forEach((r, i) => {
    const lineNo = i + 2
    if (r.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `中野区CSVの${lineNo}件目の列数が想定(${EXPECTED_HEADER.length}列)と違います: ${JSON.stringify(r)}`
      )
    }
    const [rawName, , labelCol, noteCol, , , , classCol] = r
    if (classCol.trim() !== EXPECTED_CLASS) {
      throw new Error(
        `中野区CSVの${lineNo}件目: 「分類」が「${EXPECTED_CLASS}」ではありません(別のデータが混ざった可能性): ${JSON.stringify(classCol)}`
      )
    }
    const { name } = splitName(rawName)
    const label = labelCol.trim()
    if (!name || !label) {
      throw new Error(
        `中野区CSVの${lineNo}件目: 品目名か種別が空です: ${JSON.stringify(r.slice(0, 4))}`
      )
    }
    const note = noteCol.replace(/\r\n?/g, "\n").trim()
    lines.push(
      [WARD_CODE, String(i + 1), name, label, note].map(quote).join(",")
    )
  })
  return lines.join("\n") + "\n"
}
