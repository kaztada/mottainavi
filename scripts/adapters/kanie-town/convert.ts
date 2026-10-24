import { parseCsv } from "../../core/csv"

/**
 * 蟹江町「ごみの出し方一覧」の CSV(町独自の4列)を標準形式の CSV にする。
 * 原本の形(町のオープンデータ一覧の令和8年9月1日の版): UTF-8(BOM つき)、見出しは「50音順, 品名, 分別, 注意点」。
 * 「50音順」は頭文字(あ・い・う…)で読みではないので使わない。
 *
 * 区分(分別)が空の行は、町の「ごみの分け方・出し方(五十音順)」(2026-06-15)と1件ずつ照合して読み替える
 * (37行は町のページで「収集できません」、ルーフキャリア(車用)だけ「粗大」)。
 * 読み替えは EMPTY_LABEL_FIXES に品目名で明示し、載っていない空の行があれば止める(町が行を足した・直した可能性)。
 * 区分が入っている行は、文字も区分も変えない(町の現行の案内と食い違う品目は index.ts の itemNotes で注記する)。
 */
export const EXPECTED_HEADER = ["50音順", "品名", "分別", "注意点"]
export const CITY_CODE = "234257"
export const NOT_COLLECTED_LABEL = "収集できません"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

/** 区分が空の行の読み替え(品目名 → 区分)。町の五十音順の表と照合済み(2026-10-24) */
export const EMPTY_LABEL_FIXES: Record<string, string> = {
  ...Object.fromEntries(
    [
      "石（灯ろう・墓石・つけもの石など）",
      "医療系廃棄物",
      "衣類乾燥機",
      "うす（もちつき用）",
      "エアコン",
      "エンジンオイル",
      "オイル（車・バイク・農機具等用）",
      "オイルヒーター",
      "オートバイ（部品含む）",
      "温水器（給湯器）",
      "ガスボンベ",
      "金庫（耐火用）家庭用",
      "車（車体・パーツ）",
      "原動機付自転車",
      "消火器",
      "食器洗い乾燥機（キッチン一体型）",
      "セメント",
      "洗濯機",
      "タイヤ",
      "タイヤホイール",
      "注射器",
      "鉄アレイ（ダンベル）",
      "テレビ（液晶・プラズマ・ブラウン管）",
      "電気温水器",
      "農機具",
      "農業用ビニール",
      "農薬",
      "バイク（部品含む）",
      "廃油（機械油）",
      "発煙筒",
      "バッテリー（自動車用）",
      "発電機",
      "ピアノ",
      "ペンキ",
      "ボウリングの球",
      "薬品・農薬類",
      "冷蔵庫・冷凍庫",
    ].map((n) => [n, NOT_COLLECTED_LABEL])
  ),
  // 町の表では「粗大」(ボックス型のものは収集できない)
  "ルーフキャリア（車用）": "粗大ごみ",
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text.replace(/^﻿/, ""))
  const header = rows[0]?.map((h) => h.trim())
  if (
    !header ||
    header.length !== EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(
      `蟹江町CSVの見出しが想定(${EXPECTED_HEADER.join(", ")})と違います: ${JSON.stringify(header)}`
    )
  }
  const usedEmpty = new Set<string>()
  const lines = [HEADER.map(quote).join(",")]
  let id = 0
  rows.slice(1).forEach((r, i) => {
    const lineNo = i + 2
    if (r.every((c) => !c.trim())) return
    if (r.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `蟹江町CSVの${lineNo}行目の列数が想定(4列)と違います: ${r.length}列`
      )
    }
    const [, name, rawLabel, rawNote] = r.map((c) => c.trim())
    let label = rawLabel
    if (!name) throw new Error(`蟹江町CSVの${lineNo}行目: 品名が空です`)
    if (!label) {
      const fixed = EMPTY_LABEL_FIXES[name]
      if (!fixed) {
        throw new Error(
          `蟹江町CSVの${lineNo}行目: 区分が空で、読み替えの指定がありません(町の表で確かめて EMPTY_LABEL_FIXES に足す): ${name}`
        )
      }
      usedEmpty.add(name)
      label = fixed
    }
    id += 1
    lines.push(
      [CITY_CODE, String(id), name, label, rawNote.replace(/\r\n?/g, "\n")]
        .map(quote)
        .join(",")
    )
  })
  const unusedEmpty = Object.keys(EMPTY_LABEL_FIXES).filter(
    (n) => !usedEmpty.has(n)
  )
  if (unusedEmpty.length > 0) {
    throw new Error(
      `蟹江町CSV: 読み替えの品目が見つかりません(町が区分を埋めた・削除した可能性): ${unusedEmpty.join(", ")}`
    )
  }
  return lines.join("\n") + "\n"
}
