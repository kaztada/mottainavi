import { parseCsv } from "../../core/csv"

/**
 * 金沢市「ごみ分別辞典」の CSV は、見出しつきの4列(品目, フリガナ, ごみの種類, ごみの出し方)。
 * 国の標準形式と同じ列の並びに直して、共通アダプタ(core/standard-csv.ts)で読めるようにする。
 * 「フリガナ」の列は使わない(読みは共通パイプラインが付ける)。
 */
const SOURCE_HEADER = ["品目", "フリガナ", "ごみの種類", "ごみの出し方"]
/** 全国地方公共団体コード(金沢市) */
const LG_CODE = "172014"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`
/** 見出しの「品　　目」のように、字の間に入っている空白を除く */
const squeeze = (s: string) => s.replace(/[\s　]+/g, "")

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text.replace(/^﻿/, "")).filter((r) =>
    r.some((c) => c.trim())
  )
  const header = rows[0]?.map(squeeze)
  // 市が列を足したり並べ替えたりしたら気づけるように、見出しが違えば止める
  if (
    !header ||
    header.length !== SOURCE_HEADER.length ||
    SOURCE_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(
      `金沢市CSVの見出しが想定と違います: ${JSON.stringify(rows[0])}`
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  rows.slice(1).forEach((r, i) => {
    const line = i + 2
    if (r.length !== SOURCE_HEADER.length) {
      throw new Error(
        `金沢市CSVの${line}行目の列数が想定(${SOURCE_HEADER.length}列)と違います: ${JSON.stringify(r)}`
      )
    }
    const [name, , label, rawNote] = r
    if ([name, label, rawNote].some((c) => c.includes("�"))) {
      throw new Error(
        `金沢市CSVの${line}行目に文字化けがあります: ${JSON.stringify(r)}`
      )
    }
    // 「ごみの出し方」のセル内の改行は、文の途中の折り返し(「…ひと洗いして⏎出してください。」)。つないで1つの文に戻す
    const note = rawNote.replace(/\s*\r?\n\s*/g, "")
    lines.push([LG_CODE, "", name.trim(), label, note].map(quote).join(","))
  })
  return lines.join("\n") + "\n"
}
