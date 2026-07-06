import Fuse from "fuse.js"
import type { SearchIndexItem } from "./schemas"

/** カタカナ→ひらがな変換(記号・英数はそのまま)。scripts のかな生成とも共用 */
export function katakanaToHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  )
}

/**
 * 検索用正規化(tech-stack.md §4)。クエリと検索対象の両方に適用する。
 * NFKC → 小文字化 → カタカナ→ひらがな → 長音・スペース除去
 */
export function normalizeForSearch(text: string): string {
  return katakanaToHiragana(text.normalize("NFKC").toLowerCase()).replace(
    /[ー\s　]/g,
    ""
  )
}

/** Fuse に渡す検索エントリ。表示用の元データ+正規化済みフィールド */
export interface SearchEntry {
  item: SearchIndexItem
  nn: string // name_ja 正規化
  nk: string // name_kana 正規化
  na: string[] // aliases 正規化
  ne: string // name_en 正規化(nullは空文字)
}

export function buildSearchEntries(index: SearchIndexItem[]): SearchEntry[] {
  return index.map((item) => ({
    item,
    nn: normalizeForSearch(item.n),
    nk: normalizeForSearch(item.k),
    na: item.a.map(normalizeForSearch),
    ne: item.e ? normalizeForSearch(item.e) : "",
  }))
}

export function createFuse(entries: SearchEntry[]): Fuse<SearchEntry> {
  return new Fuse(entries, {
    keys: [
      { name: "nn", weight: 0.5 },
      { name: "nk", weight: 0.3 },
      { name: "na", weight: 0.15 },
      { name: "ne", weight: 0.05 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 1,
  })
}

/** クエリを正規化して検索。結果はスコア順 */
export function searchItems(
  fuse: Fuse<SearchEntry>,
  query: string
): SearchIndexItem[] {
  const q = normalizeForSearch(query)
  if (!q) return []
  return fuse.search(q).map((r) => r.item.item)
}
