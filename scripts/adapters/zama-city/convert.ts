import ExcelJS from "exceljs"
import { cellText } from "../fukuoka-city/convert"

/**
 * 座間市「ごみ分別リスト(令和6年10月21日更新)」(座間市オープンデータ、Excel)を標準形式の CSV にする。
 * 原本の形:
 * - 見えるシートは「分別リスト」の1枚だけ(ほかの3枚「表紙」「懸案品目」「懸案品目 (2)」は非表示の古い作業用で、読まない)
 * - 見出しは「索引, ごみ品目一覧: 品目, カテゴリー, ごみの出し方, 類義語」の5列
 * - 「ごみの出し方」の一部に、市が案内している民間の許可事業者の名前と電話番号が入っている
 *
 * 変換: 品目 → 品目、カテゴリー → 分別区分、ごみの出し方 → 注意点 にする(ID は連番)。
 * 出し方の文字は変えない(改行コードをそろえるだけ)。事業者の名前が入った出し方には、Kaz の判断(2026-10-20)で、
 * 事業者と電話番号は 2024年10月時点のものであること・最新は市の一覧表で確かめることを、末尾に注記として足す。
 */
export const SHEET = "分別リスト"
export const EXPECTED_HEADER = [
  "索引",
  "ごみ品目一覧: 品目",
  "カテゴリー",
  "ごみの出し方",
  "類義語",
]
/** 座間市の全国地方公共団体コード */
const CITY_CODE = "142166"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

/** 出し方に入っている民間の事業者・団体の名前(2024-10 版で確かめたもの) */
export const BUSINESS =
  /日環|善山商店|清水商事|上原商事|清川商店|池田商店|総合トランステック|リサイクル[協共]同組合|ティ・エム・メンテナンス|ワンエイド/

/** 事業者の名前が入った出し方の末尾に足す注記(Kaz の判断 2026-10-20) */
export const BUSINESS_NOTE =
  "※もったいナビ注: 上の事業者の名前と電話番号は、2024年10月時点の市のデータのものです。最新は、市のページ「市では収集できないごみの出し方」にある『座間市排出禁止品収集可能事業者一覧表』でご確認ください(費用や収集日は各事業者へ)。"

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** 出し方: 改行コードをそろえ、事業者の名前があれば末尾に注記を足す(市の文字は変えない) */
export function buildNote(raw: string): string {
  const note = raw.replace(/\r\n?/g, "\n").trim()
  return BUSINESS.test(note) ? `${note}\n${BUSINESS_NOTE}` : note
}

/** Excel のバイト列 → 標準形式の CSV テキスト */
export async function xlsxToStandardCsv(data: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data as unknown as ArrayBuffer)
  const ws = wb.getWorksheet(SHEET)
  if (!ws) throw new Error(`座間市Excelにシート「${SHEET}」がありません`)
  const header = EXPECTED_HEADER.map((_, i) =>
    cellText(ws.getRow(1).getCell(i + 1).value).trim()
  )
  if (EXPECTED_HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(
      `座間市Excelの見出しが想定と違います: ${JSON.stringify(header)}`
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  let id = 0
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const cell = (c: number) => cellText(row.getCell(c).value).trim()
    const name = cell(2)
    const label = cell(3)
    if (!name && !label && !cell(4)) continue // 空行
    if (!name || !label) {
      throw new Error(
        `座間市Excelの${r}行目: 品目か区分が空です: ${JSON.stringify([name, label])}`
      )
    }
    id += 1
    lines.push(
      [CITY_CODE, String(id), name, label, buildNote(cell(4))]
        .map(quote)
        .join(",")
    )
  }
  return lines.join("\n") + "\n"
}
