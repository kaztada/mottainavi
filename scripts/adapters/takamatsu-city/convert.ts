import { parseCsv } from "../../core/csv"

/**
 * 高松市「ごみ分別一覧」(高松市オープンデータ、UTF-8 BOM つきの CSV、2023-03-29 登録)を標準形式の CSV にする。
 * 原本の形:
 * - 見出しは「#property, name, classification, note」の4列(通番・品目名・区分・注意点)
 * - 末尾に品目名も区分も空の行がある(2023-03 版では通番 635〜641 の7行)
 * - 区分名のゆれ: 「紙布」(「紙・布」の書き損じ)が1件、1セル2区分の「破砕、臨時・粗大」(ござ(プラスチック製))が1件
 *
 * 変換: 4列を標準形式(全国地方公共団体コード, ID, 品目, 分別区分, 注意点)にする。ID は市の通番をそのまま使う。
 * 区分名・注意点の文字は変えない(区分名のゆれは index.ts の labelToId で、2区分は labelSeparator「、」で受ける)。
 * 注意点は改行コードをそろえるだけ。市が形を変えたときに静かに壊れないよう、前提が崩れたら止める。
 */
export const EXPECTED_HEADER = ["#property", "name", "classification", "note"]
/** 高松市の全国地方公共団体コード */
const CITY_CODE = "372013"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** 注意点: 改行コードをそろえるだけ(文字は変えない) */
export function normalizeNote(note: string): string {
  return note.replace(/\r\n?/g, "\n").trim()
}

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text.replace(/^﻿/, ""))
  const header = rows[0]?.map((h) => h.trim())
  if (!header || EXPECTED_HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(
      `高松市CSVの見出しが想定(${EXPECTED_HEADER.join(", ")})と違います: ${JSON.stringify(header)}`
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  rows.slice(1).forEach((r, i) => {
    const lineNo = i + 2
    if (r.length === 1 && !r[0].trim()) return // 最後の改行
    if (r.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `高松市CSVの${lineNo}行目の列数が想定(4列)と違います: ${r.length}列`
      )
    }
    const [id, name, label, note] = r.map((c) => c.trim())
    if (!name && !label && !note) return // 品目名も区分も空の行(末尾の空行)
    if (!name || !label) {
      throw new Error(
        `高松市CSVの${lineNo}行目: 品目名か区分が空です: ${JSON.stringify(r)}`
      )
    }
    lines.push(
      [CITY_CODE, id, name, label, normalizeNote(note)].map(quote).join(",")
    )
  })
  return lines.join("\n") + "\n"
}
