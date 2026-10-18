import { parseCsv } from "../../core/csv"

/**
 * 奥州市「ゴミの分別方法一覧」の CSV(Shift_JIS。共通アダプタが UTF-8 に直したもの)は、
 * 国の標準形式の一部の10列(最後の列は見出しが空)。
 * 注意点の文末が「。。」になっている行がある(2026-05-01 版で17行)ので、句点を1つにする。
 * 見出しが変わったら止める(列が増えたり並びが変わったりしたときに気づけるように)。
 */
const HEADER = [
  "全国地方公共団体コード",
  "ID",
  "品目",
  "分別区分",
  "注意点",
  "料金種別",
  "料金",
  "料金備考",
  "備考",
  "",
]

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** 注意点の重なった句点(「。。」)を1つにする */
export function fixDoublePeriod(note: string): string {
  return note.replace(/。{2,}/g, "。")
}

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text.replace(/^﻿/, "")).filter((r) =>
    r.some((c) => c.trim())
  )
  const header = rows[0]?.map((h) => h.trim())
  if (
    !header ||
    header.length !== HEADER.length ||
    HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(`奥州市CSVの見出しが想定と違います: ${JSON.stringify(header)}`)
  }
  const lines = [HEADER.slice(0, 9).map(quote).join(",")]
  rows.slice(1).forEach((r, i) => {
    // 最後の見出しの無い列は全行が空(2026-05-01 版)。値が入ったら、注意文言に足すかを決めるために止める
    if ((r[9] ?? "").trim()) {
      throw new Error(
        `奥州市CSVの${i + 2}行目の見出しの無い列に値があります: ${JSON.stringify(r)}`
      )
    }
    const cells = r.slice(0, 9)
    cells[4] = fixDoublePeriod(cells[4] ?? "")
    lines.push(cells.map(quote).join(","))
  })
  return lines.join("\n") + "\n"
}
