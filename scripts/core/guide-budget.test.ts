import { describe, expect, it } from "vitest"
import {
  MAX_CONNECTIONS_PER_CITY,
  MAX_URLS_PER_CITY,
  budgetedFetch,
  holdReason,
  countingCurl,
  isRefusal,
  overBudget,
  type Budget,
} from "./guide-budget"

/** n 回 curl を動かす作りものの取得(転送や再試行の代わり) */
function fakeFetch(hops: Record<string, number>) {
  const curl = countingCurl(async () => "ok")
  return async (url: string) => {
    for (let i = 0; i < (hops[url] ?? 1); i++) await curl()
    return url
  }
}

describe("budgetedFetch", () => {
  it("上限は URL 3つ・接続8回", () => {
    expect(MAX_URLS_PER_CITY).toBe(3)
    expect(MAX_CONNECTIONS_PER_CITY).toBe(8)
  })

  it("curl を動かした回数(転送の各段・再試行)を市ごとに数える", async () => {
    const b: Budget = {}
    const f = fakeFetch({ "https://a/1": 3, "https://b/1": 2 })
    await Promise.all([budgetedFetch(b, "a", "https://a/1", f), budgetedFetch(b, "b", "https://b/1", f)])
    expect(b.a).toEqual({ urls: ["https://a/1"], connections: 3 })
    expect(b.b).toEqual({ urls: ["https://b/1"], connections: 2 })
  })

  it("記録から返したとき(curl を動かさない)は接続を数えない", async () => {
    const b: Budget = {}
    await budgetedFetch(b, "a", "https://a/1", fakeFetch({ "https://a/1": 0 }))
    expect(b.a.connections).toBe(0)
    expect(b.a.urls).toEqual(["https://a/1"])
  })

  it("3つ目までは取り、4つ目の新しい URL は取りに行かずに断る", async () => {
    const b: Budget = {}
    const f = fakeFetch({})
    for (const u of ["https://a/1", "https://a/2", "https://a/3"])
      expect(isRefusal(await budgetedFetch(b, "a", u, f))).toBe(false)
    const r = await budgetedFetch(b, "a", "https://a/4", f)
    expect(isRefusal(r)).toBe(true)
    expect(b.a.urls).toHaveLength(3)
    expect(b.a.connections).toBe(3)
    // 使った URL の取り直し(記録から返す)は断らない
    expect(isRefusal(await budgetedFetch(b, "a", "https://a/2", fakeFetch({ "https://a/2": 0 })))).toBe(false)
  })

  it("接続が8回に達したら、新しい URL は取りに行かない", async () => {
    const b: Budget = { a: { urls: ["https://a/1"], connections: 8 } }
    let called = false
    const r = await budgetedFetch(b, "a", "https://a/2", async () => {
      called = true
      return "x"
    })
    expect(isRefusal(r)).toBe(true)
    expect(called).toBe(false)
  })

  it("取得の途中で8回を超えたら、その市は保留になる", async () => {
    const b: Budget = { a: { urls: ["https://a/1"], connections: 6 } }
    await budgetedFetch(b, "a", "https://a/2", fakeFetch({ "https://a/2": 3 }))
    expect(b.a.connections).toBe(9)
    expect(overBudget(b.a)).toMatch(/8 回を超えた/)
  })

  it("上限ちょうどは保留にしない", () => {
    expect(overBudget({ urls: ["1", "2", "3"], connections: 8 })).toBeNull()
    expect(overBudget({ urls: ["1", "2", "3", "4"], connections: 1 })).toMatch(/3 を超えた/)
    expect(overBudget(undefined)).toBeNull()
  })

  it("取得が失敗しても、使った URL と回数は残す", async () => {
    const b: Budget = {}
    const curl = countingCurl(async () => "x")
    await expect(
      budgetedFetch(b, "a", "https://a/1", async () => {
        await curl()
        await curl()
        throw new Error("つながらない")
      })
    ).rejects.toThrow()
    expect(b.a).toEqual({ urls: ["https://a/1"], connections: 2 })
  })

  it("市の外(確かめていないとき)の curl は数えない", async () => {
    const curl = countingCurl(async () => "x")
    await curl()
    const b: Budget = {}
    await budgetedFetch(b, "a", "https://a/1", fakeFetch({ "https://a/1": 1 }))
    expect(b.a.connections).toBe(1)
  })
})

describe("holdReason", () => {
  it("確かめる途中で上限のために取得を断ったら、ほかが上限内でも市ごと保留", () => {
    expect(holdReason({ urls: ["1", "2", "3"], connections: 3 }, ["1市で確かめる URL は 3 つまで"])).toMatch(
      /上限のため確かめきれない/
    )
  })
  it("断りが無く上限内なら保留にしない", () => {
    expect(holdReason({ urls: ["1", "2", "3"], connections: 8 }, [])).toBeNull()
  })
  it("断りが無くても上限を超えていれば保留", () => {
    expect(holdReason({ urls: ["1"], connections: 9 }, [])).toMatch(/8 回を超えた/)
  })
})
