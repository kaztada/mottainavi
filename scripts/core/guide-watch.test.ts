import { describe, expect, it } from "vitest"
import type { GuideFiles } from "../../src/lib/official-guides"
import type { RegistryEntry } from "../../src/lib/schemas"
import {
  buildTargets,
  dueReviews,
  needsAttention,
  unreachableForStreak,
  nextState,
  parseNotified,
  parseState,
  renderReviewsBody,
  renderWatchBody,
  reviewKey,
} from "./guide-watch"

const reg = (slug: string, status: RegistryEntry["status"]): RegistryEntry => ({
  slug,
  lg_code: "000000",
  pref: "テスト県",
  name_ja: `${slug}市`,
  name_en: slug,
  status,
  official_url: null,
})

const files: GuideFiles = {
  hosts: {
    a: { top_url: "https://www.city.a.lg.jp/", hosts: ["www.city.a.lg.jp"], checked_at: "2026-10-15", basis: "t" },
    s: { top_url: null, hosts: ["www.city.s.lg.jp"], basis: "t" },
  },
  services: {
    svc: { name_ja: "外部", name_en: "Ext", hosts: ["svc.example.jp"], terms_url: null, checked_at: "2026-11-04" },
  },
  guides: {
    a: {
      checked_at: "2026-11-04",
      source: "t",
      links: [
        {
          kind: "search",
          url: "https://svc.example.jp/x?id=a",
          target: "html-page",
          document: "search",
          searchable: false,
          partial: false,
          scope: "whole",
          final_url: "https://svc.example.jp/x?id=a",
          via: { id: "svc", linked_from: "https://www.city.a.lg.jp/gomi/" },
        },
        {
          kind: "list",
          url: "https://www.city.a.lg.jp/gomi/list.html",
          target: "html-page",
          document: "text-pdf",
          searchable: true,
          partial: false,
          scope: "whole",
          document_url: "https://www.city.a.lg.jp/a.pdf",
          document_sha256: "1".repeat(64),
        },
      ],
    },
  },
  reviews: [],
}

describe("buildTargets", () => {
  it("ページに出る全部の URL を見張る(市のトップ・導線・中の資料・紹介元)。対応済みの市は見ない", () => {
    const t = buildTargets([reg("a", "unsupported"), reg("s", "supported")], files)
    expect(t.map((x) => `${x.role} ${x.url}`)).toEqual([
      "top https://www.city.a.lg.jp/",
      "guide https://svc.example.jp/x?id=a",
      "linked-from https://www.city.a.lg.jp/gomi/",
      "guide https://www.city.a.lg.jp/gomi/list.html",
      "document https://www.city.a.lg.jp/a.pdf",
    ])
    const ext = t[1]
    expect(ext.allowedHosts).toEqual(["www.city.a.lg.jp", "svc.example.jp"])
    expect(ext.expectedFinalUrl).toBe("https://svc.example.jp/x?id=a")
    expect(t[2].mustLinkTo).toBe("https://svc.example.jp/x?id=a")
    expect(t[4].pageUrl).toBe("https://www.city.a.lg.jp/gomi/list.html")
  })
})

describe("nextState: 取得できないが続いた月の数", () => {
  it("月が変われば足し、同じ月のやり直しは数えない。戻った URL は消す", () => {
    const s1 = nextState(null, "2026-12", ["u1", "u2"])
    expect(s1.streak).toEqual({ u1: 1, u2: 1 })
    const again = nextState(s1, "2026-12", ["u1", "u2"])
    expect(again.streak).toEqual({ u1: 1, u2: 1 })
    const s2 = nextState(again, "2027-01", ["u1"])
    expect(s2.streak).toEqual({ u1: 2 })
  })
  it("Issue の本文に書いて読み戻せる", () => {
    const s = nextState(null, "2026-12", ["u1"])
    const body = renderWatchBody([], s, "2026-12-01")
    expect(parseState(body)).toEqual(s)
    expect(parseState("壊れた本文")).toBeNull()
  })
})

describe("renderWatchBody", () => {
  it("誤案内の疑いを先に出し、2か月続いた取得できないに印を付ける", () => {
    const target = (url: string) => ({ slug: "a", role: "guide" as const, url, names: ["a市"], allowedHosts: [] })
    const body = renderWatchBody(
      [
        { target: target("u-ok"), judgement: { verdict: "ok", reasons: [] } },
        { target: target("u-un"), judgement: { verdict: "unreachable", reasons: ["403"] } },
        { target: target("u-sus"), judgement: { verdict: "suspect-redirect", reasons: ["別のホスト"] } },
      ],
      { month: "2027-01", base: { "u-un": 1 }, streak: { "u-un": 2 } },
      "2027-01-05"
    )
    expect(body.indexOf("誤案内の疑い(転送)")).toBeLessThan(body.indexOf("## 取得できない"))
    expect(body).toContain("2か月続いています")
    expect(body).not.toContain("u-ok")
  })
})

describe("証明書の連鎖の不足", () => {
  it("人が見るものに数えず、月の数も数えない。本文には畳んで残す", () => {
    const target = { slug: "a", role: "top" as const, url: "u-chain", names: ["a市"], allowedHosts: [] }
    const results = [
      { target, judgement: { verdict: "unreachable" as const, reasons: ["60"], tlsChain: true } },
    ]
    expect(needsAttention(results)).toBe(false)
    expect(unreachableForStreak(results)).toEqual([])
    const body = renderWatchBody(results, nextState(null, "2026-12", []), "2026-12-01")
    expect(body).toContain("<details>")
    expect(body).toContain("u-chain")
  })
})

describe("見直しの予定日", () => {
  const reviews = [
    { slug: "a", due: "2026-11-30", reason_ja: "切り替え" },
    { slug: "a", due: "2027-03-01", reason_ja: "電話" },
  ]
  it("当日を含めて過ぎた予定だけ、まだ知らせていないものを出す", () => {
    expect(dueReviews(reviews, "2026-11-29", []).length).toBe(0)
    expect(dueReviews(reviews, "2026-11-30", []).map((r) => r.due)).toEqual(["2026-11-30"])
    expect(dueReviews(reviews, "2026-12-01", [reviewKey(reviews[0])]).length).toBe(0)
  })
  it("知らせた印を本文に残し、次から二重に出さない", () => {
    const due = dueReviews(reviews, "2026-11-30", [])
    const { body, comment } = renderReviewsBody(due, [], new Map([["a", "テスト県a市"]]))
    expect(comment).toContain("テスト県a市")
    expect(parseNotified(body)).toEqual([reviewKey(reviews[0])])
    expect(dueReviews(reviews, "2026-12-01", parseNotified(body)).length).toBe(0)
  })
})
