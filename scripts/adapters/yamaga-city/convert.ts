import { parseCsv } from "../../core/csv"

/**
 * 山鹿市「家庭ごみ分別一覧」の CSV は、市独自の9列
 * (市区町村コード, NO, 都道府県名, 市区町村名, 音, 品名, 品名_カナ, ごみ区分, ポイント)。
 * 国の標準形式と同じ列の並び(全国地方公共団体コード, ID, 品目, 分別区分, 注意点)に直して、
 * 共通アダプタ(core/standard-csv.ts)で読めるようにする。注意書きは「ポイント」の列だけにある。
 * 「音」「品名_カナ」の列は使わない(読みは共通パイプラインが付ける)。
 */
export const EXPECTED_HEADER = [
  "市区町村コード",
  "NO",
  "都道府県名",
  "市区町村名",
  "音",
  "品名",
  "品名_カナ",
  "ごみ区分",
  "ポイント",
]
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text.replace(/^﻿/, "")).filter((r) =>
    r.some((c) => c.trim())
  )
  // 市が列を足したり並べ替えたりしたら気づけるように、見出しが違えば止める
  const header = rows[0]?.map((h) => h.trim())
  if (
    !header ||
    header.length !== EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(
      `山鹿市CSVの見出しが想定と違います: ${JSON.stringify(header)}`
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  rows.slice(1).forEach((r, i) => {
    if (r.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `山鹿市CSVの${i + 2}行目の列数が想定(${EXPECTED_HEADER.length}列)と違います: ${JSON.stringify(r)}`
      )
    }
    const [code, no, , , , name, , label, point] = r
    lines.push([code, no, name, label, point].map(quote).join(","))
  })
  return lines.join("\n") + "\n"
}
