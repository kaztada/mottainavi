import ExcelJS from "exceljs"

/**
 * 福岡市「ごみの分け方(品目)検索」の Excel は、国の標準形式の5列(列名の接頭辞は「ゴミの分別方法_」)。
 * ただし注意点に HTML(<br />・<a href>・&nbsp; など)が混ざっているので、読める文にしてから
 * 標準形式の CSV テキストにし、共通アダプタ(core/standard-csv.ts)で読む。
 */
const HEADER = [
  "ゴミの分別方法_全国地方公共団体コード",
  "ゴミの分別方法_ID",
  "ゴミの分別方法_品目",
  "ゴミの分別方法_分別区分",
  "ゴミの分別方法_注意点",
]

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

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
}

/**
 * 注意点の HTML を読める文にする。
 * - <a href="URL">文言</a> は「文言(URL)」に(アプリは注意文言の中の URL を自動でリンクにする)
 * - <br> と block 要素は空白に、そのほかのタグは取り除く
 * - 文言と URL が同じなら URL だけ
 */
export function htmlToText(html: string): string {
  const withLinks = html.replace(
    /<a\s[^>]*?href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a\s*>/gi,
    (_m, url: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, "").trim()
      if (!url) return text
      return !text || text === url ? url : `${text}(${url})`
    }
  )
  return withLinks
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(div|p|li|tr)\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e)
    .replace(/[ \t 　]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** Excel のバイト列 → 標準形式の CSV テキスト(見出しの検査つき。市が列構成を変えたら気づけるように) */
export async function xlsxToStandardCsv(data: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error("福岡市Excelにシートがありません")
  const header = HEADER.map((_, i) =>
    cellText(ws.getRow(1).getCell(i + 1).value).trim()
  )
  if (HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(
      `福岡市Excelの列構成が想定と違います: ${JSON.stringify(header)}`
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const cells = HEADER.map((_, i) => cellText(row.getCell(i + 1).value))
    if (!cells.some((c) => c.trim())) return
    cells[4] = htmlToText(cells[4])
    lines.push(cells.map(quote).join(","))
  })
  return lines.join("\n") + "\n"
}
