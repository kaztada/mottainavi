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

/** 複数形をそろえる(batteries→battery、bottles→bottle)。厳密な語形変化ではない */
function singular(word: string): string {
  if (word.length > 3 && word.endsWith("ies")) return word.slice(0, -3) + "y"
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1)
  }
  return word
}

/**
 * 英語の文字列を語に分ける(NFKC → 小文字化 → 英数字以外で区切る → 複数形をそろえる)。
 * 英語は語の区切りを残して照合する。空白を除くと「containing asbestos」に gas が当たるため。
 */
export function englishWords(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singular)
}

/** 英数字と記号だけの検索語か(英語の語単位の照合を使うかどうか) */
function isAsciiQuery(query: string): boolean {
  return /^[\x20-\x7e]+$/.test(query.normalize("NFKC").trim())
}

/** 1文字の打ち間違い(置換・挿入・削除・隣どうしの入れ替え)か */
function isOneTypo(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length > b.length) [a, b] = [b, a]
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  if (a.length === b.length) {
    return (
      a.slice(i + 1) === b.slice(i + 1) ||
      (a[i] === b[i + 1] &&
        a[i + 1] === b[i] &&
        a.slice(i + 2) === b.slice(i + 2))
    )
  }
  return a.slice(i) === b.slice(i + 1)
}

/** 語どうしの一致の強さ。0: そのまま一致 / 1: 語の先頭が一致 / 2: 語の途中に含む / 3: 1文字の打ち間違い */
const TIER_EXACT = 0
const TIER_PREFIX = 1
const TIER_CONTAINS = 2
const TIER_TYPO = 3
/** 語の途中の一致・打ち間違いは、短い検索語では雑音になるので使わない(oil→Soil、chair→chain) */
const MIN_CONTAINS_LENGTH = 4
const MIN_TYPO_LENGTH = 6

function wordTier(query: string, word: string): number | null {
  if (word === query) return TIER_EXACT
  if (word.startsWith(query)) return TIER_PREFIX
  if (query.length >= MIN_CONTAINS_LENGTH && word.includes(query)) {
    return TIER_CONTAINS
  }
  if (query.length >= MIN_TYPO_LENGTH && isOneTypo(query, word)) {
    return TIER_TYPO
  }
  return null
}

interface EnglishMatch {
  /** 検索語のうち、いちばん弱い一致の強さ */
  tier: number
  /** 最初の検索語が当たった語の位置(前にあるほど上) */
  position: number
  /** 当たった文字列の語数(短いほど上)。英語名は括弧の前だけを数える */
  length: number
  /** 0: 英語名に当たった / 1: 英語の別名に当たった(ほかが同じなら英語名を上に) */
  source: number
}

/** 検索語のすべての語が、1つの文字列(英語名または英語の別名)の語に当たるか */
function matchEnglishText(
  queryWords: string[],
  words: string[],
  length: number,
  source: number
): EnglishMatch | null {
  let tier = TIER_EXACT
  let position = 0
  for (const [qi, q] of queryWords.entries()) {
    let best: number | null = null
    let bestAt = 0
    for (const [wi, w] of words.entries()) {
      const t = wordTier(q, w)
      if (t !== null && (best === null || t < best)) {
        best = t
        bestAt = wi
      }
    }
    if (best === null) return matchJoined(queryWords, words, length, source)
    tier = Math.max(tier, best)
    if (qi === 0) position = bestAt
  }
  return { tier, position, length, source }
}

/** 語を続けて書いた検索語(sofabed、cellphone)を、続く2語以上の先頭に当てる */
function matchJoined(
  queryWords: string[],
  words: string[],
  length: number,
  source: number
): EnglishMatch | null {
  const joined = queryWords.join("")
  for (let start = 0; start < words.length - 1; start++) {
    let text = words[start]
    for (let end = start + 1; end < words.length; end++) {
      text += words[end]
      if (text.startsWith(joined)) {
        return { tier: TIER_PREFIX, position: start, length, source }
      }
      if (text.length >= joined.length) break
    }
  }
  return null
}

/** Fuse に渡す検索エントリ。表示用の元データ+正規化済みフィールド */
export interface SearchEntry {
  item: SearchIndexItem
  nn: string // name_ja 正規化
  nk: string // name_kana 正規化
  na: string[] // aliases 正規化
  ne: string // name_en 正規化(nullは空文字)
  /** aliases のうち日本語のもの(正規化)。英数字の検索語のあいまい検索に使う */
  naJa: string[]
  /** 英語名を語に分けたもの(無ければ空) */
  ew: string[]
  /** 英語名の括弧の前の語数(「Battery (button cell)」は 1)。並び順に使う */
  ewHead: number
  /** 英語の別名を、それぞれ語に分けたもの */
  aw: string[][]
}

export function buildSearchEntries(index: SearchIndexItem[]): SearchEntry[] {
  return index.map((item) => ({
    item,
    nn: normalizeForSearch(item.n),
    nk: normalizeForSearch(item.k),
    na: item.a.map(normalizeForSearch),
    ne: item.e ? normalizeForSearch(item.e) : "",
    naJa: item.a.filter((a) => !isAsciiQuery(a)).map(normalizeForSearch),
    ew: item.e ? englishWords(item.e) : [],
    ewHead: item.e ? englishWords(item.e.split("(")[0]).length : 0,
    aw: item.a
      .filter(isAsciiQuery)
      .map(englishWords)
      .filter((words) => words.length > 0),
  }))
}

const FUSE_OPTIONS = {
  threshold: 0.35,
  ignoreLocation: true,
  minMatchCharLength: 1,
}

/** 検索に使うもの一式。初回検索時に createSearcher で作る */
export interface Searcher {
  entries: SearchEntry[]
  /** 日本語の検索語用(従来どおり) */
  fuse: Fuse<SearchEntry>
  /** 英数字の検索語用。英語名と英語の別名は語単位で別に照合するので、あいまい検索の対象から外す */
  fuseJa: Fuse<SearchEntry>
}

export function createSearcher(index: SearchIndexItem[]): Searcher {
  const entries = buildSearchEntries(index)
  return {
    entries,
    fuse: new Fuse(entries, {
      ...FUSE_OPTIONS,
      keys: [
        { name: "nn", weight: 0.5 },
        { name: "nk", weight: 0.3 },
        { name: "na", weight: 0.15 },
        { name: "ne", weight: 0.05 },
      ],
    }),
    fuseJa: new Fuse(entries, {
      ...FUSE_OPTIONS,
      keys: [
        { name: "nn", weight: 0.5 },
        { name: "nk", weight: 0.3 },
        { name: "naJa", weight: 0.15 },
      ],
    }),
  }
}

/**
 * 英数字の検索語: 英語名・英語の別名を語単位で照合する。
 * 並び順は 語がそのまま一致・語の先頭が一致 → 日本語名へのあいまい一致(CDプレーヤー、LED電球 など)
 * → 語の途中の一致・打ち間違い。
 */
function searchEnglish(searcher: Searcher, query: string): SearchIndexItem[] {
  const queryWords = englishWords(query)
  const strong: { entry: SearchEntry; match: EnglishMatch }[] = []
  const weak: { entry: SearchEntry; match: EnglishMatch }[] = []
  if (queryWords.length > 0) {
    for (const entry of searcher.entries) {
      let best = matchEnglishText(queryWords, entry.ew, entry.ewHead, 0)
      for (const words of entry.aw) {
        const m = matchEnglishText(queryWords, words, words.length, 1)
        if (m && (best === null || compareMatch(m, best) < 0)) best = m
      }
      if (!best) continue
      ;(best.tier <= TIER_PREFIX ? strong : weak).push({ entry, match: best })
    }
  }
  const byMatch = (
    a: { match: EnglishMatch },
    b: { match: EnglishMatch }
  ): number => compareMatch(a.match, b.match)
  const ordered = [
    ...strong.sort(byMatch).map((r) => r.entry),
    ...searcher.fuseJa.search(normalizeForSearch(query)).map((r) => r.item),
    ...weak.sort(byMatch).map((r) => r.entry),
  ]
  const seen = new Set<string>()
  const results: SearchIndexItem[] = []
  for (const entry of ordered) {
    if (seen.has(entry.item.id)) continue
    seen.add(entry.item.id)
    results.push(entry.item)
  }
  return results
}

function compareMatch(a: EnglishMatch, b: EnglishMatch): number {
  return (
    a.tier - b.tier ||
    a.position - b.position ||
    a.length - b.length ||
    a.source - b.source
  )
}

/** クエリを正規化して検索。日本語の検索語はスコア順、英数字の検索語は語単位の一致を先に並べる */
export function searchItems(
  searcher: Searcher,
  query: string
): SearchIndexItem[] {
  const q = normalizeForSearch(query)
  if (!q) return []
  if (isAsciiQuery(query)) return searchEnglish(searcher, query)
  return searcher.fuse.search(q).map((r) => r.item.item)
}
