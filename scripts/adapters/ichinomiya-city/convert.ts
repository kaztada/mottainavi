import { parseCsv } from "../../core/csv"

/**
 * 一宮市「資源とごみの分別に関するデータ」(CSV、Shift_JIS)を標準形式の CSV にする。
 * 原本の形(2026-10 版):
 * - 1行目が表題「分別帳一覧」、2行目が空、3行目が見出し(ごみ名, 索引, 分別区分, 分別注意文)、4行目がまた空
 * - 見出しの後ろに空の列が14ある(全行で空)。ID の列は無い
 * - 品目のあいだに空行がある
 * - 区分名に市のアプリの画面の文言「(詳しくはここをタップ)」「(詳細はここをタップ)」が混ざっている
 * - 注意文の「(詳しくはこちら)」「〜についての詳細はこちら」のすぐ後ろに市のページの URL がある
 * - 1セル2区分は「〜もしくは〜」(「リチウムイオン電池を使用した小型家電など、もしくは不燃ごみ」のように読点が付くものもある)
 *
 * 変換: 4列を標準形式(全国地方公共団体コード, ID, 品目, 分別区分, 注意点)にする。ID は連番。
 * 区分名からアプリの文言を外し、区切りを「もしくは」にそろえる。
 * 注意文はプロジェクトの決まり(市の注意点は原文のまま残す)に従い、改行コードをそろえるだけで文字は変えない
 * (「詳しくはこちら」の後ろの URL は、アプリが自動でリンクにする。2026-10 版では URL の直後はすべて改行か日本語で、
 * リンクが壊れる所は無い)。書き損じ(「一辺が６０ｃｍのもの」など)は直さず、必要な補いは index.ts の itemNotes で添える。
 * 市が形を変えたときに静かに壊れないよう、前提が崩れたら止める。
 */
export const TITLE = "分別帳一覧"
export const EXPECTED_HEADER = ["ごみ名", "索引", "分別区分", "分別注意文"]
/** 見出しの後ろの空の列の数(合計 18 列) */
export const TOTAL_COLUMNS = 18
export const LABEL_SEPARATOR = "もしくは"
/** 一宮市の全国地方公共団体コード */
const CITY_CODE = "232033"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** 区分名を直す: アプリの画面の文言を外し、1セル2区分の区切りの前の読点を外す */
export function normalizeLabel(label: string): string {
  return label
    .replace(/（詳しくはここをタップ）|（詳細はここをタップ）/g, "")
    .replace(/、もしくは/g, LABEL_SEPARATOR)
    .trim()
}

/** 注意文: 改行コードをそろえるだけ(文字は変えない) */
export function normalizeNote(note: string): string {
  return note.replace(/\r\n?/g, "\n").trim()
}

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text.replace(/^﻿/, ""))
  if (rows[0]?.[0]?.trim() !== TITLE) {
    throw new Error(
      `一宮市CSVの1行目が表題「${TITLE}」ではありません: ${JSON.stringify(rows[0]?.slice(0, 4))}`
    )
  }
  const headerIndex = rows.findIndex((r) =>
    EXPECTED_HEADER.every((h, i) => r[i]?.trim() === h)
  )
  if (headerIndex < 0 || headerIndex > 3) {
    throw new Error(
      "一宮市CSVの見出し(ごみ名, 索引, 分別区分, 分別注意文)が見つかりません"
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  let id = 0
  rows.slice(headerIndex + 1).forEach((r, i) => {
    const lineNo = headerIndex + i + 2
    if (r.length !== TOTAL_COLUMNS) {
      throw new Error(
        `一宮市CSVの${lineNo}行目の列数が想定(${TOTAL_COLUMNS}列)と違います: ${r.length}列`
      )
    }
    if (r.slice(EXPECTED_HEADER.length).some((c) => c.trim())) {
      throw new Error(
        `一宮市CSVの${lineNo}行目: 5列目より後ろは空の前提ですが、値があります(市が列を足した可能性): ${JSON.stringify(r)}`
      )
    }
    const [nameCol, , labelCol, noteCol] = r.map((c) => c.trim())
    if (!nameCol && !labelCol && !noteCol) return // 空行
    if (!nameCol || !labelCol) {
      throw new Error(
        `一宮市CSVの${lineNo}行目: 品目名か区分が空です: ${JSON.stringify(r.slice(0, 4))}`
      )
    }
    const label = normalizeLabel(labelCol)
    const note = normalizeNote(noteCol)
    // 区分名に画面の文言が残っていたら、市が書き方を変えた(直し方を見直す)
    if (/タップ/.test(label)) {
      throw new Error(
        `一宮市CSVの${lineNo}行目: 区分名に「タップ」が残っています(直し方を見直してください): ${JSON.stringify([nameCol, label])}`
      )
    }
    id += 1
    lines.push(
      [CITY_CODE, String(id), nameCol, label, note].map(quote).join(",")
    )
  })
  return lines.join("\n") + "\n"
}
