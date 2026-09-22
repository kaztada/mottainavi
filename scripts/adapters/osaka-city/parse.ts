import * as cheerio from "cheerio"
import type { Element } from "domhandler"

import type { RawDispositionRow, RawItem } from "../../core/types"

export type { RawDispositionRow, RawItem }

/** セル内テキストの正規化: 改行・連続空白(全角含む)を単一スペースに、前後trim */
export function cleanCellText(text: string): string {
  return text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * 一覧表HTMLから品目の生配列を抽出する。
 *
 * 実ページの構造(data/cache/osaka-items.html で確認):
 * - 五十音ごとに別々の<table>(ヘッダ行は th scope="col" ×3)
 * - データ行は「品目名 = <th scope="row">」+「収集区分 = <td>」+「ポイント = <td>」
 * - 複数区分の品目は品目名thに rowspan が付き、続き行は<td>2つのみ
 */
export function parseItemTables(html: string, baseUrl: string): RawItem[] {
  const $ = cheerio.load(html)
  const items: RawItem[] = []

  $("table").each((_, table) => {
    // 一覧表以外のテーブルを除外(ヘッダ行に「品目」を含むものだけ処理)
    const headerText = cleanCellText($(table).find("tr").first().text())
    if (!headerText.includes("品目")) return

    let current: RawItem | null = null

    $(table)
      .find("tr")
      .each((_, tr) => {
        const ths = $(tr).find("th")
        const tds = $(tr).find("td")
        if (tds.length === 0) return // th のみ = ヘッダ行

        // 品目名は th(scope="row")。th が無い行は rowspan の続き(追加区分)
        const name = ths.length > 0 ? cleanCellText(ths.first().text()) : ""

        // 市ページに紛れている「*****」のマスク行(編集中プレースホルダ)は除外
        if (/^\*+$/.test(name)) return
        const categoryCell = $(tds[0])
        const noteCell = tds.length > 1 ? $(tds[1]) : null

        const categoryLabel = cleanCellText(categoryCell.text())
        if (!categoryLabel) return // 区分が空の行はデータ行でない

        const note = noteCell ? cleanCellText(noteCell.text()) : ""
        // 公式リンクは区分セルの<a>を優先、無ければポイントセルから
        const link =
          extractFirstLink($, categoryCell, baseUrl) ??
          (noteCell ? extractFirstLink($, noteCell, baseUrl) : null)

        const row: RawDispositionRow = {
          category_label: categoryLabel,
          note: note || null,
          official_link: link,
        }

        if (name && current && name === current.name_ja) {
          // 同名の連続行 → 追加区分としてマージ
          current.rows.push(row)
        } else if (name) {
          current = { name_ja: name, rows: [row] }
          items.push(current)
        } else if (current) {
          // 品目名なし行(rowspanの続き)→ 直前品目に集約
          current.rows.push(row)
        }
        // current が無いのに名無し行が来た場合は捨てる(表頭の崩れ等)
      })
  })

  return items
}

/** セル内の最初の<a href>を絶対URLで返す(tel:リンクは対象外) */
function extractFirstLink(
  $: cheerio.CheerioAPI,
  cell: cheerio.Cheerio<Element>,
  baseUrl: string
): string | null {
  const href = cell
    .find("a[href]")
    .toArray()
    .map((a) => $(a).attr("href"))
    .find((h) => h && !h.startsWith("tel:"))
  if (!href) return null
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return null
  }
}
