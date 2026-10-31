import { parseCsv } from "../../core/csv"

/**
 * 恵庭市「ごみ分別辞典」の CSV(市独自の4列: 品目, 類義語, カテゴリー, 分別方法)を標準形式の CSV にする。
 * - 注意文(分別方法)は前後の空白・改行を取り、改行を LF にするだけで、文字は変えない
 * - 品目名は前後の空白を取り、続いた空白を全角1つにする。「※袋に入る」などの注記は残す
 *   (同じ物が条件で別の区分に分かれている行があり、外すと取り違えるため)
 * - 品目でない「愛」「思い出」の2行を除く(無ければ止まる)
 * - 同じ名前で注意文だけ違う「油（食用）」は、案内の多い行だけを残す(文の中身は残す行に含まれる)
 * - 「資源物」は注意文の「★」の印で8種類に分けて区分名に足す(冊子 P20 の①〜⑧)。ダンボールだけは印が無いので名前で読む。
 *   印の無い行・知らない印の行があれば止まる(市がデータを直した可能性)
 * 類義語の列は使わない(aliases.json の語は語尾一致で他の品目にも付くため)。
 */
export const EXPECTED_HEADER = ["品目", "類義語", "カテゴリー", "分別方法"]
export const CITY_CODE = "012319"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

export const NON_ITEM_NAMES = ["愛", "思い出"] as const

/** 同じ名前の行のうち、捨てる行(品目名 → その行の注意文。残す行が案内を全部含むもの) */
export const DROP_DUPLICATES: Record<string, string> = {
  "油（食用）":
    "指定ごみ袋に入れて出してください。\n■凝固剤で固めるか紙などにしみ込ませる。\n■ペットボトル等の容器に入れて、市の窓口に持ち込むこともできます。：無料",
}

/** 注意文の「★」の印 → 資源物の種類(冊子 P20) */
export const SHIGEN_MARKS: readonly [string, string][] = [
  ["★プラスチック容器包装", "資源物(プラスチック容器包装)"],
  ["★びん、缶、ペットボトル", "資源物(ペットボトル・缶・びん)"],
  ["★雑誌、本", "資源物(雑誌・本)"],
  ["★紙パック", "資源物(紙パック)"],
  ["★新聞チラシ", "資源物(新聞)"],
  ["★電池", "資源物(電池)"],
  ["★蛍光管", "資源物(蛍光管・LED・水銀使用製品)"],
  ["★水銀", "資源物(蛍光管・LED・水銀使用製品)"],
]

/** 資源物の行の区分名(注意文の印で決める) */
export function shigenLabel(name: string, note: string): string {
  if (name === "ダンボール") return "資源物(ダンボール)"
  const hits = SHIGEN_MARKS.filter(([mark]) => note.includes(mark))
  const labels = new Set(hits.map(([, label]) => label))
  if (labels.size !== 1) {
    throw new Error(
      `恵庭市CSV: 資源物の種類を注意文から決められません: ${name}(${[...labels].join("/") || "印なし"})`
    )
  }
  return [...labels][0]
}

export function normalizeName(name: string): string {
  return name.trim().replace(/[ \t　]+/g, "　")
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text)
  const header = rows[0]?.map((h) => h.trim())
  if (
    !header ||
    header.length !== EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(
      `恵庭市CSVの見出しが想定(${EXPECTED_HEADER.join(", ")})と違います: ${JSON.stringify(header)}`
    )
  }
  const seenNonItems = new Set<string>()
  const seenDrops = new Set<string>()
  const lines = [HEADER.map(quote).join(",")]
  let id = 0
  rows.slice(1).forEach((r, i) => {
    if (r.every((c) => !c.trim())) return
    if (r.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `恵庭市CSVの${i + 2}行目の列数が想定(4列)と違います: ${r.length}列`
      )
    }
    const name = normalizeName(r[0])
    const category = r[2].trim()
    const note = r[3].replace(/\r\n?/g, "\n").trim()
    if (!name || !category) {
      throw new Error(`恵庭市CSVの${i + 2}行目: 品目か区分が空です`)
    }
    if ((NON_ITEM_NAMES as readonly string[]).includes(name)) {
      seenNonItems.add(name)
      return
    }
    if (DROP_DUPLICATES[name] === note) {
      seenDrops.add(name)
      return
    }
    const label = category === "資源物" ? shigenLabel(name, note) : category
    id += 1
    lines.push([CITY_CODE, String(id), name, label, note].map(quote).join(","))
  })
  for (const n of NON_ITEM_NAMES) {
    if (!seenNonItems.has(n)) {
      throw new Error(`恵庭市CSV: 除く行が見つかりません(市がデータを直した可能性): ${n}`)
    }
  }
  for (const n of Object.keys(DROP_DUPLICATES)) {
    if (!seenDrops.has(n)) {
      throw new Error(`恵庭市CSV: まとめる行が見つかりません(市がデータを直した可能性): ${n}`)
    }
  }
  return lines.join("\n") + "\n"
}
