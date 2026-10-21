import ExcelJS from "exceljs"
import { cellText } from "../fukuoka-city/convert"

/**
 * 稲沢市「ゴミの分別方法一覧」(稲沢市オープンデータ、Excel、データ更新日 2025-02-14)を標準形式の CSV にする。
 * 原本の形:
 * - シート「ゴミの分別方法一覧」、先頭の5列が「ごみ名, 索引, 分別区分, 分別注意文, 追加検索キーワード」。
 *   その後ろに、排出方法ごとの「〇」の列が37列ある(分別区分と同じ内容の目印。注意文ではないので読まない)
 * - 品目の後ろに、書式だけが残った空の行が続く
 * - 分別注意文の改行に、Excel の内部の表記「_x000D_」が残っている
 * - 1セル2区分は「粗大ごみまたは不燃ごみ」のように「または」でつなぐ
 *
 * 変換: ごみ名 → 品目、分別区分 → 分別区分、分別注意文 → 注意点 にする(ID は連番)。
 * 注意点は「_x000D_」を取って改行コードをそろえるだけで、文字は変えない。
 */
export const SHEET = "ゴミの分別方法一覧"
export const EXPECTED_HEADER = [
  "ごみ名",
  "索引",
  "分別区分",
  "分別注意文",
  "追加検索キーワード",
]
export const LABEL_SEPARATOR = "または"
/** 稲沢市の全国地方公共団体コード */
const CITY_CODE = "232203"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** 注意点: Excel の内部の改行表記「_x000D_」を取り、改行コードをそろえる(文字は変えない) */
export function normalizeNote(note: string): string {
  return note
    .replace(/_x000D_/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
}

/** Excel のバイト列 → 標準形式の CSV テキスト */
export async function xlsxToStandardCsv(data: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data as unknown as ArrayBuffer)
  const ws = wb.getWorksheet(SHEET)
  if (!ws) throw new Error(`稲沢市Excelにシート「${SHEET}」がありません`)
  const header = EXPECTED_HEADER.map((_, i) =>
    cellText(ws.getRow(1).getCell(i + 1).value).trim()
  )
  if (EXPECTED_HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(
      `稲沢市Excelの見出しが想定と違います: ${JSON.stringify(header)}`
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  let id = 0
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const cell = (c: number) => cellText(row.getCell(c).value).trim()
    const name = cell(1)
    const label = cell(3)
    const note = normalizeNote(cellText(row.getCell(4).value))
    if (!name && !label && !note) continue // 書式だけの空行
    if (!name || !label) {
      throw new Error(
        `稲沢市Excelの${r}行目: ごみ名か分別区分が空です: ${JSON.stringify([name, label])}`
      )
    }
    id += 1
    lines.push([CITY_CODE, String(id), name, label, note].map(quote).join(","))
  }
  return lines.join("\n") + "\n"
}
