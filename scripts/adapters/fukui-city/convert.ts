import { parseCsv } from "../../core/csv"

/**
 * 福井県「ごみ分別一覧」の福井市(福井・美山地域)の CSV(Shift_JIS、県内の市町共通の8列)を標準形式の CSV にする。
 * 原本の形(2026-09-16 掲載の版):
 * - 見出しは「行, 音, 物品名, キーワード, 区分, 分類, 条件, 備考」の8列(行・音は五十音の頭文字、キーワードは読み)
 * - 出し方の注意は「条件」の列。「分類」「備考」は全行が空
 *
 * 変換: 物品名 → 品目、区分 → 分別区分、条件 → 注意点 にする(ID は連番)。
 * 注意点の文字は変えない(改行コードをそろえるだけ)。「備考」に値があれば、注意点の後ろに原文のまま足す。
 * 「分類」に値が入ったら、県が使い方を変えた可能性があるので止める。
 */
export const EXPECTED_HEADER = [
  "行",
  "音",
  "物品名",
  "キーワード",
  "区分",
  "分類",
  "条件",
  "備考",
]
/** 福井市の全国地方公共団体コード */
const CITY_CODE = "182010"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** 注意点: 改行コードをそろえるだけ(文字は変えない) */
export function normalizeNote(note: string): string {
  return note.replace(/\r\n?/g, "\n").trim()
}

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text.replace(/^﻿/, ""))
  const header = rows[0]?.map((h) => h.trim())
  if (!header || EXPECTED_HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(
      `福井市CSVの見出しが想定(${EXPECTED_HEADER.join(", ")})と違います: ${JSON.stringify(header)}`
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  let id = 0
  rows.slice(1).forEach((r, i) => {
    const lineNo = i + 2
    if (r.every((c) => !c.trim())) return // 空行
    if (r.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `福井市CSVの${lineNo}行目の列数が想定(8列)と違います: ${r.length}列`
      )
    }
    const [, , name, , label, bunrui, joken, biko] = r.map((c) => c.trim())
    if (!name || !label) {
      throw new Error(
        `福井市CSVの${lineNo}行目: 物品名か区分が空です: ${JSON.stringify(r)}`
      )
    }
    if (bunrui) {
      throw new Error(
        `福井市CSVの${lineNo}行目: 「分類」は空の前提ですが、値があります(県が列の使い方を変えた可能性): ${JSON.stringify(r)}`
      )
    }
    const note = [joken, biko].map(normalizeNote).filter(Boolean).join("\n")
    id += 1
    lines.push([CITY_CODE, String(id), name, label, note].map(quote).join(","))
  })
  return lines.join("\n") + "\n"
}
