import { parseCsv } from "../../core/csv"

/**
 * 東大和市の「ゴミの分別方法」CSV(東京都オープンデータカタログ、国の標準形式、UTF-8)を、共通アダプタが読む列の並びにする。
 * 原本は標準形式の列の3列目に「ゴミの分別方法_地方公共団体名」が入った10列なので、その列だけを取り除く(ほかの値は変えない)。
 */
export const PREFIX = "ゴミの分別方法_"
export const EXPECTED_HEADER = [
  "全国地方公共団体コード",
  "ID",
  "地方公共団体名",
  "品目",
  "分別区分",
  "注意点",
  "料金種別",
  "料金",
  "料金備考",
  "備考",
].map((h) => PREFIX + h)

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text.replace(/^﻿/, ""))
  const header = rows[0]?.map((h) => h.trim())
  if (!header || EXPECTED_HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(
      `東大和市CSVの見出しが想定(${EXPECTED_HEADER.join(", ")})と違います: ${JSON.stringify(header)}`
    )
  }
  return (
    rows
      .filter((r, i) => i === 0 || r.some((c) => c.trim()))
      .map((r) => r.filter((_, i) => i !== 2).map(quote).join(","))
      .join("\n") + "\n"
  )
}
