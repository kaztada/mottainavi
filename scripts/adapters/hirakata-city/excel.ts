import ExcelJS from "exceljs"
import { EXPECTED_HEADER, type HirakataRow } from "./parse"

/** セルの値 → 文字列(リッチテキスト・数式の結果・数値に対応) */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("")
    if ("result" in value)
      return value.result == null ? "" : String(value.result)
    if ("text" in value) return String(value.text)
    return ""
  }
  return String(value)
}

/** xlsm のバイト列 → 行(ヘッダ検証つき。市が列構成を変えたら気づけるように) */
export async function readHirakataWorkbook(
  data: Buffer
): Promise<HirakataRow[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error("枚方市Excelにシートがありません")
  const header = [1, 2, 3, 4, 5].map((c) =>
    cellText(ws.getRow(1).getCell(c).value).trim()
  )
  if (EXPECTED_HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(
      `枚方市Excelの列構成が想定と違います: ${JSON.stringify(header)}`
    )
  }
  const rows: HirakataRow[] = []
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const name = cellText(row.getCell(2).value)
    if (!name.trim()) return
    rows.push({
      name,
      note: cellText(row.getCell(4).value),
      label: cellText(row.getCell(5).value),
    })
  })
  return rows
}
