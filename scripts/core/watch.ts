import { createHash } from "node:crypto"
import { fetchFresh } from "./fetch-cache"
import type { WatchSpec } from "./types"

/**
 * データ更新の検出(tech-stack.md §17)。
 * 各市の掲載ページ(または BODIK の API)を1回だけ見て、「いまのデータファイルの URL」と
 * 「目印(fingerprint)」を返す。目印が前回と違えば、データが更新されたとみなす。
 * HTML・JSON から目印を作る部分は純粋関数(テスト対象)。
 */
export interface Detected {
  /** いまのデータファイルの URL。ページ自体がデータの場合は null(URL は変わらない) */
  fileUrl: string | null
  fingerprint: string
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")

const plain = (html: string) =>
  decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()

/**
 * 掲載ページから、リンクの文言が linkText に合うデータファイルへのリンクを1つ拾う。
 * 目印は「リンク先 | リンクの文言(ファイルサイズや更新月を含むことが多い) | 直後の最終更新日」。
 * 見つからない・複数あるときは、ページの構成が変わった可能性があるのでエラーにする。
 */
export function detectFromPage(
  html: string,
  pageUrl: string,
  linkText: RegExp
): Detected {
  const found = new Map<string, string>()
  const re = /<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  for (const m of html.matchAll(re)) {
    const text = plain(m[2])
    if (!linkText.test(text)) continue
    const url = new URL(decodeEntities(m[1]), pageUrl).href
    const after = plain(html.slice(m.index + m[0].length).slice(0, 300))
    const date = after.slice(0, 60).match(/最終更新日[：:]\s*[^）)\s]+/)?.[0]
    found.set(url, [url, text, date].filter(Boolean).join(" | "))
  }
  if (found.size === 0) {
    throw new Error(
      `データファイルへのリンクが見つかりません(ページの構成が変わった可能性): ${pageUrl}`
    )
  }
  if (found.size > 1) {
    throw new Error(
      `データファイルへのリンクが複数あります: ${[...found.keys()].join(", ")}`
    )
  }
  const [fileUrl, fingerprint] = [...found][0]
  return { fileUrl, fingerprint }
}

interface CkanResource {
  url?: string
  format?: string
  name?: string
  last_modified?: string | null
  created?: string | null
}

/**
 * BODIK(CKAN)の package_show の応答から、いちばん新しい CSV のリソースを拾う。
 * 市が新しいリソースを足す場合も、同じリソースを上書きする場合も検出できる。
 */
export function detectFromCkan(json: unknown, resourceName?: RegExp): Detected {
  const result = (json as { result?: { resources?: CkanResource[] } }).result
  const resources = (result?.resources ?? []).filter(
    (r) =>
      r.url &&
      (r.format ?? "").toUpperCase() === "CSV" &&
      (!resourceName || resourceName.test(r.name ?? ""))
  )
  if (resources.length === 0) {
    throw new Error("CKAN の応答に CSV のリソースがありません")
  }
  const stamp = (r: CkanResource) => r.last_modified ?? r.created ?? ""
  const latest = resources.reduce((a, b) => (stamp(b) > stamp(a) ? b : a))
  return {
    fileUrl: latest.url as string,
    fingerprint: `${latest.url} | ${stamp(latest)}`,
  }
}

/** ページ自体がデータの場合: 選んだ内容(品目表など)のハッシュを目印にする */
export function detectFromContent(content: string): Detected {
  return {
    fileUrl: null,
    fingerprint:
      "sha256:" + createHash("sha256").update(content).digest("hex").slice(0, 32),
  }
}

/** 見張り対象を1回だけ取得して、いまの状態を返す */
export async function checkWatch(
  spec: WatchSpec,
  fetchText: (url: string) => Promise<string> = async (url) =>
    (await fetchFresh(url)).toString("utf-8")
): Promise<Detected> {
  switch (spec.kind) {
    case "ckan":
      return detectFromCkan(JSON.parse(await fetchText(spec.api)), spec.resourceName)
    case "page-link":
      return detectFromPage(await fetchText(spec.pageUrl), spec.pageUrl, spec.linkText)
    case "page-content":
      return detectFromContent(spec.select(await fetchText(spec.pageUrl)))
  }
}
