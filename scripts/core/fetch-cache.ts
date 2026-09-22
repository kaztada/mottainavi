import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

// 個人開発の分別検索ツール。問い合わせ可能なUAを名乗る
const USER_AGENT = "mottainavi/0.2 (personal recycling-guide project)"

/**
 * キャッシュ優先の取得。自治体・官公庁サイトへのアクセスは
 * キャッシュが無いとき(または refresh=true)の1回のみ。連続アクセスしない。
 */
async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } })
  if (!res.ok) {
    throw new Error(`取得失敗: ${res.status} ${res.statusText} (${url})`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** テキスト(HTML/CSV)をキャッシュ優先で取得 */
export async function fetchWithCache(
  url: string,
  cachePath: string,
  refresh = false
): Promise<{ html: string; fromCache: boolean }> {
  if (!refresh && existsSync(cachePath)) {
    return { html: await readFile(cachePath, "utf-8"), fromCache: true }
  }
  const html = (await fetchBytes(url)).toString("utf-8")
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, html, "utf-8")
  return { html, fromCache: false }
}

/** バイナリ(Excel等)をキャッシュ優先で取得 */
export async function fetchBinaryWithCache(
  url: string,
  cachePath: string,
  refresh = false
): Promise<{ data: Buffer; fromCache: boolean }> {
  if (!refresh && existsSync(cachePath)) {
    return { data: await readFile(cachePath), fromCache: true }
  }
  const data = await fetchBytes(url)
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, data)
  return { data, fromCache: false }
}
