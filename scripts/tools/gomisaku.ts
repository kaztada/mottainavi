/**
 * 市公式のネット版分別辞典「ごみサク」(gomisaku.jp)との照合ロジック(純粋関数。テスト対象)。
 * 自治体のオープンデータが古くなっていないかを確かめる判断材料に使う。
 * ごみサクのほうが古いこともあるので、食い違いは「候補」であって正解ではない。
 */

export interface GomisakuItem {
  name: string
  type: string
}

export interface NameLabel {
  name: string
  label: string
}

/** ごみサクの dictionary.js / type.js(`gomisakuGetData('x',{...})` 形式)→ レコードの配列 */
export function parseGomisakuJs(text: string): Record<string, string>[] {
  const body = text.slice(text.indexOf(",") + 1, text.lastIndexOf(")"))
  const data = JSON.parse(body) as {
    array: { dict: { key: string[]; string: unknown[] }[] }
  }
  return data.array.dict.map((d) => {
    const rec: Record<string, string> = {}
    d.key.forEach((k, i) => {
      const v = d.string[i]
      rec[k] = typeof v === "string" ? v : ""
    })
    return rec
  })
}

export function toGomisakuItems(
  dictionaryJs: string,
  typeJs: string
): GomisakuItem[] {
  const types = new Map(
    parseGomisakuJs(typeJs).map((t) => [t.typeID, t.name])
  )
  return parseGomisakuJs(dictionaryJs).map((d) => ({
    name: d.name,
    type: types.get(d.typeID) ?? `(不明な区分 ${d.typeID})`,
  }))
}

/** 品目名の突き合わせ用の正規化: NFKC、空白・かっこ・中黒を除く */
export function normalizeName(s: string): string {
  return s.normalize("NFKC").replace(/[\s()・]/g, "")
}

const normLabel = (s: string) => s.normalize("NFKC").replace(/\s/g, "")
/** 「金属(資源再生物)」→「金属」のように、末尾のかっこ書きを外した形 */
const stripParen = (s: string) => s.replace(/\([^()]*\)$/, "")

export interface Mismatch {
  name: string
  label: string
  gomisakuType: string
}

export interface CompareResult {
  total: number
  matched: number
  /** データ側の区分 → ごみサクの区分ごとの件数(多い順) */
  pairs: { label: string; types: { type: string; count: number }[] }[]
  /** その区分で多数派ではないごみサクの区分に入っている品目(食い違いの候補) */
  mismatches: Mismatch[]
  /** ごみサクにだけある品目 */
  onlyInGomisaku: GomisakuItem[]
}

/**
 * 品目名が一致するものを突き合わせ、区分の対応を数える。
 * 区分名の対応表は要らない: データ側の区分ごとに、ごみサクで最も多い区分を「対応する区分」とみなし、
 * それ以外に入っている品目を食い違いの候補として挙げる(同数のときは区分名が同じものを優先)。
 */
export function compareWithGomisaku(
  items: NameLabel[],
  gomisaku: GomisakuItem[]
): CompareResult {
  const gsByName = new Map(gomisaku.map((g) => [normalizeName(g.name), g]))
  const matchedKeys = new Set<string>()
  const byLabel = new Map<string, { name: string; type: string }[]>()
  for (const it of items) {
    const key = normalizeName(it.name)
    const g = gsByName.get(key)
    if (!g) continue
    matchedKeys.add(key)
    const label = normLabel(it.label)
    const list = byLabel.get(label) ?? []
    list.push({ name: it.name, type: normLabel(g.type) })
    byLabel.set(label, list)
  }

  const pairs: CompareResult["pairs"] = []
  const mismatches: Mismatch[] = []
  for (const [label, list] of byLabel) {
    const counts = new Map<string, number>()
    for (const x of list) counts.set(x.type, (counts.get(x.type) ?? 0) + 1)
    const max = Math.max(...counts.values())
    const top = [...counts].filter(([, c]) => c === max).map(([t]) => t)
    const major =
      top.find((t) => t === label || t === stripParen(label)) ?? top[0]
    pairs.push({
      label,
      types: [...counts]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
    })
    for (const x of list) {
      if (x.type !== major) {
        mismatches.push({ name: x.name, label, gomisakuType: x.type })
      }
    }
  }
  pairs.sort((a, b) => a.label.localeCompare(b.label, "ja"))

  return {
    total: items.length,
    matched: matchedKeys.size,
    pairs,
    mismatches,
    onlyInGomisaku: gomisaku.filter(
      (g) => !matchedKeys.has(normalizeName(g.name))
    ),
  }
}

/** 危険物・誤案内になりやすい品目。区分が合っていても毎回、個別に目で確かめる */
export const WATCH_WORDS =
  /電池|バッテリー|スプレー|ライター|ガスボンベ|カセットボンベ|蛍光|LED|水銀|パソコン|消火器/

export function renderCompare(r: CompareResult, watch: Mismatch[]): string {
  const lines: string[] = []
  lines.push(
    `照合できた品目: ${r.matched} / ${r.total}(品目名が一致したもの)`,
    `区分が食い違う候補: ${r.mismatches.length} 件`,
    "",
    "## 食い違いの候補(データの区分 → ごみサクの区分)"
  )
  if (r.mismatches.length === 0) lines.push("なし")
  for (const m of r.mismatches) {
    lines.push(`- ${m.name}: ${m.label} → ${m.gomisakuType}`)
  }
  lines.push("", "## 危険物など、個別に確認する品目(ごみサクの区分)")
  if (watch.length === 0) lines.push("なし")
  for (const m of watch) {
    lines.push(`- ${m.name}: ${m.label} / ごみサク: ${m.gomisakuType}`)
  }
  lines.push("", "## 区分の対応(件数)")
  for (const p of r.pairs) {
    lines.push(
      `- ${p.label} → ${p.types.map((t) => `${t.type} ${t.count}`).join(" / ")}`
    )
  }
  lines.push("", `## ごみサクにだけある品目: ${r.onlyInGomisaku.length} 件`)
  for (const g of r.onlyInGomisaku.filter((g) => WATCH_WORDS.test(g.name))) {
    lines.push(`- ${g.name} = ${g.type}`)
  }
  return lines.join("\n")
}
