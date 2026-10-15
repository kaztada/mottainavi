/**
 * 未対応の市区町村の公式サイトの URL を、Wikidata の「公式サイト」(P856)から候補として集め、
 * 1件ずつ機械で確かめて、通ったものだけを全国レジストリの official_url に入れる(data-model.md の台帳の節)。
 * Wikidata には古い URL も残っているので、そのまま使わない。ここは確かめの判定(ネットワークに出ない部分)。
 */
import type { RegistryEntry } from "../../src/lib/schemas"

/** Wikidata の問い合わせ結果の1行 */
export type WikidataSite = {
  /** 全国地方公共団体コード(6桁、検査数字込み。レジストリの lg_code と同じ) */
  code: string
  url: string
  /** preferred / normal / deprecated */
  rank: string
  /** 終了日(P582)。あれば過去の URL */
  end?: string
}

/** トップページ(パスが / や /index.html)か */
export function isTopPage(url: string): boolean {
  try {
    return /^\/(index\.(html?|php|jsp|aspx?))?$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

/**
 * その自治体の候補。非推奨・終了日つきは除き、http(s) だけ、重複は1つに。
 * Wikidata には外国語のページなどトップページ以外も入っているので、トップページの候補があればそれだけにする
 * (確かめる接続も減る)
 */
export function candidatesFor(
  code: string,
  sites: readonly WikidataSite[]
): string[] {
  const out = new Set<string>()
  for (const s of sites) {
    if (s.code !== code) continue
    if (s.rank.endsWith("DeprecatedRank") || s.end) continue
    if (!/^https?:\/\//i.test(s.url)) continue
    out.add(s.url)
  }
  const all = [...out]
  const top = all.filter(isTopPage)
  return top.length > 0 ? top : all
}

/**
 * slug から、名前のローマ字の候補。同じ名前の自治体は都道府県のローマ字が前に付く(osaka-sakai-city)ので、
 * つないだ形と最後の部分の両方を返す(例: "osaka-sakai-city" → ["osakasakai", "sakai"])
 */
export function romajiOf(slug: string): string[] {
  const base = slug.replace(/-(city|town|village|ku)$/, "")
  const parts = base.split("-")
  return [...new Set([parts.join(""), parts[parts.length - 1]])]
}

/**
 * ホスト名が自治体のサイトらしいか。文字列の部分一致ではなく、ホスト名をラベルに分けて判定する。
 * - .lg.jp(地方公共団体のドメイン)
 * - .jp で、city / town / vill / village / ku のラベルがある(www.city.sapporo.jp など)
 * - .jp で、名前のローマ字がラベルに含まれる(www.kamikawa-town.jp など)
 */
/**
 * 古いドメインから、新しい .lg.jp の形を作る(市町村は .lg.jp に移っていることが多く、
 * Wikidata には古いほうが残っていて、証明書が切れていたり接続できなかったりする)。
 * 例: https://www.city.kuji.iwate.jp/ → https://www.city.kuji.lg.jp/。作れない形なら null。
 * 作った URL も候補として同じ確かめを通す(そのまま入れない)
 */
export function lgJpVariant(url: string): string | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  if (host.endsWith(".lg.jp")) return null
  const m = host.match(
    /^(?:www\.)?(city|town|vill|village)\.([a-z0-9-]+)(?:\.[a-z]+)?\.jp$/
  )
  if (!m) return null
  return `https://www.${m[1]}.${m[2]}.lg.jp/`
}

/** ローマ字の書き方のゆれ(紋別 mombetsu / monbetsu、本別 hombetsu / honbetsu)をそろえる */
function foldRomaji(s: string): string {
  return s.toLowerCase().replace(/-/g, "").replace(/m(?=[bmp])/g, "n")
}

export function looksLikeMunicipalHost(
  host: string,
  romaji: readonly string[]
): boolean {
  const h = host.toLowerCase().replace(/\.$/, "")
  if (h.endsWith(".lg.jp")) return true
  if (!h.endsWith(".jp")) return false
  const labels = h.split(".")
  if (labels.some((l) => ["city", "town", "vill", "village", "ku"].includes(l)))
    return true
  return romaji.some(
    (r) =>
      r.length >= 3 &&
      labels.some((l) => foldRomaji(l).includes(foldRomaji(r)))
  )
}

/**
 * ページの題名に、その自治体の名前があるか。同じ名前の自治体がほかにある場合(府中市・伊達市など)は、
 * 都道府県名も題名にあることを求める(取り違えを防ぐ)
 */
export function titleMatches(
  title: string,
  entry: Pick<RegistryEntry, "name_ja" | "pref">,
  nameIsShared: boolean
): boolean {
  const t = title.replace(/\s+/g, "")
  if (!t.includes(entry.name_ja)) return false
  return !nameIsShared || t.includes(entry.pref)
}

/** HTML から題名を取り出す */
export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!m) return null
  return m[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** HTML の文字コード(Content-Type の charset、なければ meta)。日本の自治体は Shift_JIS・EUC-JP がある */
export function detectCharset(contentType: string | null, head: string): string {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1]
  if (fromHeader) return fromHeader.toLowerCase()
  const fromMeta =
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    head.match(/<meta[^>]+content=["'][^"']*charset=([\w-]+)/i)?.[1]
  return (fromMeta ?? "utf-8").toLowerCase()
}

/** 1つの候補を確かめた結果(data/cache/official-url-check.json に残す) */
export type CandidateCheck = {
  candidate: string
  checked_at: string
  ok: boolean
  final_url?: string
  status?: number
  title?: string | null
  reason?: string
}

/** 確かめた結果から、入れる URL を決める。通った候補の行き先が1つに決まるときだけ */
export function decideOfficialUrl(checks: readonly CandidateCheck[]): {
  url: string | null
  reason: string
} {
  const ok = checks.filter((c) => c.ok && c.final_url)
  if (checks.length === 0) return { url: null, reason: "Wikidata に候補が無い" }
  if (ok.length === 0)
    return { url: null, reason: checks.map((c) => c.reason ?? "不明").join(" / ") }
  const finals = new Set(ok.map((c) => normalizeUrl(c.final_url as string)))
  if (finals.size > 1)
    return { url: null, reason: `通った候補の行き先が複数: ${[...finals].join(" , ")}` }
  return { url: [...finals][0], reason: "確かめ済み" }
}

/** 末尾の index.html などと、問い合わせ部分(?…)・#… を落とす */
export function normalizeUrl(url: string): string {
  const u = new URL(url)
  u.search = ""
  u.hash = ""
  u.pathname = u.pathname.replace(/\/index\.(html?|php|jsp|aspx?)$/i, "/")
  return u.toString()
}
