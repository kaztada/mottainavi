import { parseCsv } from "../../core/csv"

/**
 * 福井県「ごみ分別一覧」の市町ごとの CSV(県内の市町共通の8列)を標準形式の CSV にする。
 * 福井市(福井・美山地域)のほか、鯖江市・越前市・池田町も同じ変換で読む(市町ごとの違いは ConvertOptions で指定)。
 * 原本の形(福井市の2026-09-16 掲載の版):
 * - 見出しは「行, 音, 物品名, キーワード, 区分, 分類, 条件, 備考」の8列(行・音は五十音の頭文字、キーワードは読み)
 * - 出し方の注意は「条件」の列。福井市は「分類」「備考」が全行空。ほかの市町は「分類」に「日用品」「電気製品」などが入る
 *
 * 変換: 物品名 → 品目、区分 → 分別区分、条件 → 注意点 にする(ID は連番)。
 * 注意点の文字は変えない(改行コードをそろえるだけ)。「備考」に値があれば、注意点の後ろに原文のまま足す。
 * 福井市は「分類」に値が入ったら、県が使い方を変えた可能性があるので止める(他の市町は分類の値を使わない)。
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

/** 複数の出し先を区切って2枚のカードに分けるときの、変換後の区切り(共通アダプタの labelSeparator に指定する) */
export const LABEL_JOINER = "／"

export interface ConvertOptions {
  /** 全国地方公共団体コード(6桁) */
  cityCode: string
  /** エラーメッセージ用の名前(例: 福井市) */
  cityName: string
  /** 「分類」に値が入ったら止めるか。福井市だけ true(空の前提)。省略時は true */
  requireEmptyBunrui?: boolean
  /** 見出しの右に空の見出しの列が続いてもよい個数(鯖江市は1)。その列は全行空でなければならない(rowFixes を除く) */
  trailingEmptyColumns?: number
  /**
   * 1セルに複数の出し先が入る区分を分ける。regex で区切り、LABEL_JOINER でつなぎ直す(記号だけが変わる)。
   * keep に挙げた表記は区切らずそのまま(例: 「スプレー・ボンベ類」)
   */
  labelSplit?: { pattern: RegExp; keep?: readonly string[] }
  /** 区分の表記の置き換え(原文 → 置き換え後)。区切り記号が無い2区分(鯖江市の「小型家電(…)燃えないごみ」)を分ける */
  labelRewrites?: Record<string, string>
  /** 書き損じの行の直し(物品名 → 直し方)。該当の行が無ければ止める */
  rowFixes?: Record<string, { dropBiko?: boolean; dropExtra?: boolean }>
}

const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** 注意点: 改行コードをそろえるだけ(文字は変えない) */
export function normalizeNote(note: string): string {
  return note.replace(/\r\n?/g, "\n").trim()
}

/** 福井市の既定(県の共通8列で「分類」が空の版) */
export const FUKUI_CITY_OPTIONS: ConvertOptions = {
  cityCode: "182010",
  cityName: "福井市",
}

function convertLabel(label: string, opts: ConvertOptions, where: string): string {
  const rewritten = opts.labelRewrites?.[label]
  if (rewritten !== undefined) return rewritten
  const split = opts.labelSplit
  if (!split || split.keep?.includes(label)) return label
  if (label.includes(LABEL_JOINER)) {
    throw new Error(
      `${where}: 区分に区切りの記号「${LABEL_JOINER}」が含まれています: ${label}`
    )
  }
  return label
    .split(split.pattern)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(LABEL_JOINER)
}

export function toStandardCsv(
  text: string,
  opts: ConvertOptions = FUKUI_CITY_OPTIONS
): string {
  const { cityCode, cityName } = opts
  const trailing = opts.trailingEmptyColumns ?? 0
  const width = EXPECTED_HEADER.length + trailing
  const rows = parseCsv(text.replace(/^﻿/, ""))
  const header = rows[0]?.map((h) => h.trim())
  if (
    !header ||
    EXPECTED_HEADER.some((h, i) => header[i] !== h) ||
    header.slice(EXPECTED_HEADER.length).some((h) => h) ||
    header.length !== width
  ) {
    throw new Error(
      `${cityName}CSVの見出しが想定(${EXPECTED_HEADER.join(", ")}${trailing ? "+空の見出し" + trailing + "列" : ""})と違います: ${JSON.stringify(header)}`
    )
  }
  const fixes = opts.rowFixes ?? {}
  const usedFixes = new Set<string>()
  const lines = [HEADER.map(quote).join(",")]
  let id = 0
  rows.slice(1).forEach((r, i) => {
    const lineNo = i + 2
    if (r.every((c) => !c.trim())) return // 空行
    if (r.length !== width) {
      throw new Error(
        `${cityName}CSVの${lineNo}行目の列数が想定(${width}列)と違います: ${r.length}列`
      )
    }
    const cells = r.map((c) => c.trim())
    const [, , name, , label, bunrui] = cells
    let [, , , , , , joken, biko] = cells
    const extra = cells.slice(EXPECTED_HEADER.length)
    const fix = fixes[name]
    if (fix) {
      usedFixes.add(name)
      if (fix.dropBiko) biko = ""
      if (fix.dropExtra) extra.fill("")
    }
    if (extra.some((c) => c)) {
      throw new Error(
        `${cityName}CSVの${lineNo}行目: 見出しの無い列に値があります: ${JSON.stringify(r)}`
      )
    }
    if (!name || !label) {
      throw new Error(
        `${cityName}CSVの${lineNo}行目: 物品名か区分が空です: ${JSON.stringify(r)}`
      )
    }
    if ((opts.requireEmptyBunrui ?? true) && bunrui) {
      throw new Error(
        `${cityName}CSVの${lineNo}行目: 「分類」は空の前提ですが、値があります(県が列の使い方を変えた可能性): ${JSON.stringify(r)}`
      )
    }
    const note = [joken, biko].map(normalizeNote).filter(Boolean).join("\n")
    id += 1
    const outLabel = convertLabel(label, opts, `${cityName}CSVの${lineNo}行目`)
    lines.push(
      [cityCode, String(id), name, outLabel, note].map(quote).join(",")
    )
  })
  const unused = Object.keys(fixes).filter((n) => !usedFixes.has(n))
  if (unused.length > 0) {
    throw new Error(
      `${cityName}CSV: rowFixes の品目が見つかりません(県が直したか、削除された可能性): ${unused.join(", ")}`
    )
  }
  return lines.join("\n") + "\n"
}
