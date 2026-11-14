/**
 * 公式への導線を確かめるときの、1市あたりの取得の上限(2段目の決まり。tech-stack.md §19)。
 *
 * - 1市につき確かめる URL は3つまで(導線のページ・中の資料・外部のサイトの紹介元)。入口を探すために
 *   開いた途中のページも数える。電話は、この3つのどれかの本文で確かめられたときだけ載せる
 * - 接続は転送の各段と再試行を含めて8回まで(curl を動かした回数。記録から返したときは数えない)
 * - 上限に収まらない市は、その市の導線を載せずに保留する
 *
 * 使った URL と接続の回数は、実行をまたいで手元の記録(work/ の市ごとの JSON。コミットしない)に残す。
 * 再実行はキャッシュ優先なので、2回目からは接続が増えない。
 */
import { AsyncLocalStorage } from "node:async_hooks"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export const MAX_URLS_PER_CITY = 3
export const MAX_CONNECTIONS_PER_CITY = 8

export type CityUsage = { urls: string[]; connections: number }
export type Budget = Record<string, CityUsage>

/**
 * 記録は市ごとに1ファイル(<dir>/<slug>.json)。いくつかのプロセスが別々の市を同時に確かめても、
 * ほかの市の記録を上書きしない(同じ市を同時に2つのプロセスで確かめないこと)
 */
export function readBudget(dir: string): Budget {
  if (!existsSync(dir)) return {}
  const out: Budget = {}
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue
    out[f.slice(0, -5)] = JSON.parse(readFileSync(join(dir, f), "utf-8")) as CityUsage
  }
  return out
}

export function writeCityUsage(dir: string, slug: string, usage: CityUsage): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${slug}.json`), JSON.stringify(usage, null, 2) + "\n")
}

/** 上限を超えたか(超えた市は保留) */
export function overBudget(usage: CityUsage | undefined): string | null {
  if (!usage) return null
  if (usage.urls.length > MAX_URLS_PER_CITY)
    return `1市で確かめる URL が ${MAX_URLS_PER_CITY} を超えた(${usage.urls.length})`
  if (usage.connections > MAX_CONNECTIONS_PER_CITY)
    return `1市の接続が ${MAX_CONNECTIONS_PER_CITY} 回を超えた(${usage.connections})`
  return null
}

/** 市を保留にする理由(上限を超えた、または確かめる途中で上限のために取得を断った)。無ければ null */
export function holdReason(usage: CityUsage | undefined, refusals: readonly string[]): string | null {
  if (refusals.length > 0) return `上限のため確かめきれない: ${refusals[0]}`
  return overBudget(usage)
}

/** curl を動かした回数を、いま確かめている市に付ける */
const current = new AsyncLocalStorage<{ connections: number }>()

/** curl の呼び出しを数える包み(取得器の curl に差し込む) */
export function countingCurl<A extends unknown[], R>(
  curl: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return (...args: A) => {
    const c = current.getStore()
    if (c) c.connections++
    return curl(...args)
  }
}

export type BudgetRefusal = { refused: true; reason: string }

/**
 * 市の上限の中で1件取得する。まだ使っていない URL が4つ目になるとき、接続がすでに上限に
 * 達しているときは取りに行かずに断る。取ったあとは使った URL と接続の回数を書き足す
 * (取得の途中で上限を超えたときは、overBudget が保留にする)
 */
export async function budgetedFetch<T>(
  budget: Budget,
  slug: string,
  url: string,
  fetchFn: (url: string) => Promise<T>,
  save?: (usage: CityUsage) => void
): Promise<T | BudgetRefusal> {
  const usage = (budget[slug] ??= { urls: [], connections: 0 })
  const known = usage.urls.includes(url)
  if (!known && usage.urls.length >= MAX_URLS_PER_CITY)
    return { refused: true, reason: `1市で確かめる URL は ${MAX_URLS_PER_CITY} つまで(使ったもの: ${usage.urls.join(" ")})` }
  if (usage.connections >= MAX_CONNECTIONS_PER_CITY && !known)
    return { refused: true, reason: `1市の接続は ${MAX_CONNECTIONS_PER_CITY} 回まで(使った回数: ${usage.connections})` }
  const counter = { connections: 0 }
  try {
    return await current.run(counter, () => fetchFn(url))
  } finally {
    if (!known) usage.urls.push(url)
    usage.connections += counter.connections
    save?.(usage)
  }
}

export function isRefusal(x: unknown): x is BudgetRefusal {
  return typeof x === "object" && x !== null && (x as BudgetRefusal).refused === true
}
