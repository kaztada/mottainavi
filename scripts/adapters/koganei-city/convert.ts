import { parseCsv } from "../../core/csv"

/**
 * 小金井市「ゴミの分別方法一覧」の CSV(東京都オープンデータカタログ)は国の標準形式(15列)。
 * 注意点に意味の取りにくい誤字・句点の抜けがある(2026-10 時点)。意味を変えずに、その箇所だけ直す。
 * 市が直したら当たらなくなるだけなので、当たらなくても止めない。
 */
const HEADER = [
  "全国地方公共団体コード",
  "ID",
  "品目",
  "分別区分",
  "注意点",
  "料金種別",
  "料金",
  "料金備考",
  "連絡先名称",
  "連絡先電話番号",
  "連絡先内線番号",
  "連絡先メールアドレス",
  "連絡先FormURL",
  "連絡先備考",
  "備考",
]

/** [誤り, 直した文](ニカド電池・ゲーム機・充電式電池・電気の傘・布切れ・ぬいぐるみ・額縁・加熱式たばこ・家電の行) */
const TYPOS: readonly [RegExp, string][] = [
  [/で着るだけ販売店へ帰してください/g, "できるだけ販売店へ返してください"],
  [/電池を抜いてくださ$/g, "電池を抜いてください"],
  [/「有害」と書くできるだけ/g, "「有害」と書く。できるだけ"],
  [/を超えるのものは/g, "を超えるものは"],
  [/40cmを超えるは粗大ごみ/g, "40cmを超えるものは粗大ごみ"],
  [/粗大こみ/g, "粗大ごみ"],
  [/返却してください返却できない/g, "返却してください。返却できない"],
  [/受 付センター/g, "受付センター"],
]

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** 注意点の誤字を直す(意味は変えない) */
export function fixTypos(note: string): string {
  return TYPOS.reduce((s, [from, to]) => s.replace(from, to), note)
}

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text.replace(/^﻿/, "")).filter((r) =>
    r.some((c) => c.trim())
  )
  const header = rows[0]?.map((h) => h.trim())
  if (
    !header ||
    header.length !== HEADER.length ||
    HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(`小金井市CSVの見出しが想定と違います: ${JSON.stringify(header)}`)
  }
  const lines = [HEADER.map(quote).join(",")]
  for (const r of rows.slice(1)) {
    const cells = [...r]
    cells[4] = fixTypos((cells[4] ?? "").trim())
    lines.push(cells.map(quote).join(","))
  }
  return lines.join("\n") + "\n"
}
