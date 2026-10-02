import { parseCsv } from "../../core/csv"

/**
 * 長浜市「ごみ分別表」の CSV は、見出し行が無い4列(品目, よみ, 区分, 備考)。
 * 国の標準形式と同じ列の並びに直して、共通アダプタ(core/standard-csv.ts)で読めるようにする。
 * 「よみ」の列は使わない(読みは共通パイプラインが付ける)。
 */
const COLUMN_COUNT = 4
/** 全国地方公共団体コード(長浜市) */
const LG_CODE = "252034"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()))
  const lines = [HEADER.map(quote).join(",")]
  rows.forEach((r, i) => {
    // 市が列を足したり並べ替えたりしたら気づけるように、列数が違えば止める
    if (r.length !== COLUMN_COUNT) {
      throw new Error(
        `長浜市CSVの${i + 1}行目の列数が想定(${COLUMN_COUNT}列)と違います: ${JSON.stringify(r)}`
      )
    }
    const [name, , label, note] = r
    lines.push([LG_CODE, "", name, label, note].map(quote).join(","))
  })
  return lines.join("\n") + "\n"
}
