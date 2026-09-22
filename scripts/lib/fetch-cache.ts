import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

/**
 * キャッシュ優先のHTML取得。
 * 市サイトへのアクセスはキャッシュが無いとき(または refresh=true)の1回のみ。
 */
export async function fetchWithCache(
  url: string,
  cachePath: string,
  refresh = false
): Promise<{ html: string; fromCache: boolean }> {
  if (!refresh && existsSync(cachePath)) {
    const html = await readFile(cachePath, "utf-8")
    return { html, fromCache: true }
  }

  const res = await fetch(url, {
    headers: {
      // 個人開発の分別検索ツール。問い合わせ可能なUAを名乗る
      "User-Agent": "mottainavi/0.1 (personal recycling-guide project)",
    },
  })
  if (!res.ok) {
    throw new Error(`取得失敗: ${res.status} ${res.statusText} (${url})`)
  }
  const html = await res.text()

  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, html, "utf-8")
  return { html, fromCache: false }
}
