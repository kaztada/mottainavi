import { parseCsv } from "../../core/csv"

/**
 * 宮城県オープンデータポータル「【名取市】ゴミの分別方法一覧」の CSV(Shift_JIS、880品名)を標準形式の CSV にする。
 * 原本の形(2026-03-13 更新の版): 見出しは「ID, ゴミの品目, 分別区分, 注意点, 料金種別, 料金, 料金備考, 備考」の8列。
 * 標準形式の列から「全国地方公共団体コード」が抜けた形なので、コードを足して標準形式の先頭5列にする。
 * 料金種別〜備考の4列は全行空(値が入ったら止める。市が使い方を変えた可能性)。
 *
 * 直すのは2つだけ(注意点の文字はほかは変えない):
 * - 品目名の途中の改行(「モバイルバッテリー\n（スマートフォン用）」)は取る(名前で引けなくなるため)
 * - Shift_JIS で表せない「ℓ」「☎」が「?」に化けている箇所を、市の早見表(令和8年4月)で確かめた元の字に戻す。
 *   直す箇所は FIXES の文字列だけで、ほかに「?」が残っていたら止める
 */
export const EXPECTED_HEADER = [
  "ID",
  "ゴミの品目",
  "分別区分",
  "注意点",
  "料金種別",
  "料金",
  "料金備考",
  "備考",
]
const CITY_CODE = "042072"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

/** 化けた文字列 → 元の文字列(市の「家庭ごみの分け方・出し方早見表」令和8年4月で確認) */
export const FIXES: readonly [string, string][] = [
  ["200?以内", "200ℓ以内"],
  ["200?以上", "200ℓ以上"],
  ["コールセンター?050", "コールセンター☎050"],
  ["推進センター?03", "推進センター☎03"],
]

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

export function fixText(s: string): string {
  let out = s
  for (const [from, to] of FIXES) out = out.split(from).join(to)
  return out
}

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text.replace(/^﻿/, ""))
  const header = rows[0]?.map((h) => h.trim())
  if (!header || EXPECTED_HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(
      `名取市CSVの見出しが想定(${EXPECTED_HEADER.join(", ")})と違います: ${JSON.stringify(header)}`
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  rows.slice(1).forEach((r, i) => {
    const lineNo = i + 2
    if (r.every((c) => !c.trim())) return
    if (r.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `名取市CSVの${lineNo}行目の列数が想定(8列)と違います: ${r.length}列`
      )
    }
    const [id, rawName, label, rawNote, ...rest] = r.map((c) => c.trim())
    if (rest.some(Boolean)) {
      throw new Error(
        `名取市CSVの${lineNo}行目: 料金種別〜備考は空の前提ですが、値があります: ${JSON.stringify(r)}`
      )
    }
    const name = fixText(rawName.replace(/\s*\r?\n\s*/g, ""))
    const note = fixText(rawNote.replace(/\r\n?/g, "\n"))
    if (!name || !label) {
      throw new Error(`名取市CSVの${lineNo}行目: 品目か分別区分が空です`)
    }
    if ([name, label, note].some((s) => s.includes("?"))) {
      throw new Error(
        `名取市CSVの${lineNo}行目: 文字化け(「?」)が残っています。市の資料で元の字を確かめて FIXES に足してください: ${JSON.stringify(r)}`
      )
    }
    lines.push([CITY_CODE, id, name, label, note].map(quote).join(","))
  })
  return lines.join("\n") + "\n"
}
