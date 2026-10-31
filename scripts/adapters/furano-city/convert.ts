import { parseCsv } from "../../core/csv"

/**
 * 富良野市「ごみ分別辞典」の CSV(市独自の形式)を標準形式の CSV にする。
 * 原本の形(harp「ごみ分別.csv」、2025-07-17): UTF-8(BOM つき)、見出しは「50音順, 品　　　　　名, 分別の区分, 出し方のアドバイス, (空), (空)」。
 * 「50音順」は頭文字なので使わない。5・6列目は見出しも中身も空(何か入ったら止める。市が列を足した可能性)。
 *
 * 品目名は前後の空白・改行だけを取る(血糖測定用穿刺針・ファン付き作業着)。セルの中の改行は、
 * 2つの名前が1つのセルに入った「ブルーシート/レジャーシート」だけなので「/」にし、ほかにあれば止める。
 * 区分と出し方のアドバイスの文字は変えない。
 */
export const EXPECTED_HEADER = ["50音順", "品名", "分別の区分", "出し方のアドバイス", "", ""]
export const CITY_CODE = "012297"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]
/** セルの中の改行を区切りとして読む品目名(原本の2行目まで) */
const LINE_BREAK_NAMES = new Set(["ブルーシート\nレジャーシート"])

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`
const squash = (s: string) => s.replace(/[\s　]/g, "")

export function normalizeName(raw: string): string {
  const name = raw.replace(/\r\n?/g, "\n").trim()
  if (!name.includes("\n")) return name
  if (LINE_BREAK_NAMES.has(name)) return name.replace("\n", "/")
  throw new Error(`富良野市CSV: 品目名の中に改行があります: ${JSON.stringify(raw)}`)
}

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text)
  const header = rows[0]?.map(squash)
  if (
    !header ||
    header.length !== EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(
      `富良野市CSVの見出しが想定(${EXPECTED_HEADER.join(", ")})と違います: ${JSON.stringify(header)}`
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  let id = 0
  rows.slice(1).forEach((r, i) => {
    const lineNo = i + 2
    if (r.every((c) => !c.trim())) return
    if (r.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `富良野市CSVの${lineNo}行目の列数が想定(6列)と違います: ${r.length}列`
      )
    }
    if (r[4].trim() || r[5].trim()) {
      throw new Error(`富良野市CSVの${lineNo}行目: 空のはずの5・6列目に値があります`)
    }
    const name = normalizeName(r[1])
    const label = r[2].trim()
    if (!name) throw new Error(`富良野市CSVの${lineNo}行目: 品名が空です`)
    if (!label) throw new Error(`富良野市CSVの${lineNo}行目: 区分が空です(${name})`)
    id += 1
    lines.push(
      [CITY_CODE, String(id), name, label, r[3].replace(/\r\n?/g, "\n")]
        .map(quote)
        .join(",")
    )
  })
  return lines.join("\n") + "\n"
}
