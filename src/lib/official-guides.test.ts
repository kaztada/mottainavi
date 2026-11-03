import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  GUIDE_DOCUMENTS,
  GUIDE_KINDS,
  GuideLinkSchema,
  OfficialGuideEntrySchema,
  assertOfficialGuides,
  formatEdition,
  isOldEdition,
  officialGuideProblems,
  telHref,
  toPublicGuides,
  type GuideFiles,
  type GuideLink,
} from "./official-guides"
import { RegistryFileSchema, type RegistryEntry } from "./schemas"
import {
  buildHosts,
  readGuideFiles,
  serializeGuideFiles,
} from "../../scripts/core/official-guides-file"

const root = join(__dirname, "../..")
const registry = RegistryFileSchema.parse(
  JSON.parse(readFileSync(join(root, "data/municipalities.json"), "utf-8"))
)
const ui = (lang: "ja" | "en") =>
  JSON.parse(readFileSync(join(root, `data/i18n/ui.${lang}.json`), "utf-8")) as Record<
    string,
    string
  >

const reg = (
  slug: string,
  status: RegistryEntry["status"],
  official_url: string | null = null
): RegistryEntry => ({
  slug,
  lg_code: "000000",
  pref: "テスト県",
  name_ja: slug,
  name_en: slug,
  status,
  official_url,
})

const link = (over: Partial<GuideLink> = {}): GuideLink =>
  GuideLinkSchema.parse({
    kind: "list",
    url: "https://www.city.a.lg.jp/gomi/list.html",
    target: "html-page",
    document: "html",
    searchable: true,
    ...over,
  })

/** 市 a(未対応)・市 b(未対応)・市 s(対応済み)と、外部のサイト gomisaku */
const files = (over: Partial<GuideFiles> = {}): GuideFiles => ({
  guides: {},
  hosts: {
    a: { top_url: "https://www.city.a.lg.jp/", hosts: ["www.city.a.lg.jp"], checked_at: "2026-10-15", basis: "test" },
    b: { top_url: "https://www.city.b.lg.jp/", hosts: ["www.city.b.lg.jp"], checked_at: "2026-10-15", basis: "test" },
    s: { top_url: null, hosts: ["www.city.s.lg.jp"], basis: "test" },
  },
  services: {
    gomisaku: {
      name_ja: "ごみサク",
      name_en: "Gomisaku",
      hosts: ["www.gomisaku.jp"],
      terms_url: null,
      checked_at: "2026-11-01",
    },
  },
  reviews: [],
  ...over,
})
const registry3 = [reg("a", "unsupported"), reg("b", "unsupported"), reg("s", "supported", "https://www.city.s.lg.jp/gomi/")]
const entry = (links: GuideLink[], extra: Record<string, unknown> = {}) =>
  OfficialGuideEntrySchema.parse({ checked_at: "2026-11-04", links, source: "test", ...extra })

describe("GuideLinkSchema: 種類と資料の形の組み合わせ", () => {
  const bad = (over: Record<string, unknown>) =>
    GuideLinkSchema.safeParse({
      kind: "list",
      url: "https://www.city.a.lg.jp/x.html",
      target: "html-page",
      document: "html",
      searchable: true,
      ...over,
    }).success
  it("PDF に直接つなぐなら document は text-pdf か image-pdf", () => {
    expect(bad({ target: "pdf", document: "html" })).toBe(false)
    expect(bad({ target: "pdf", document: "text-pdf" })).toBe(true)
  })
  it("ページから PDF を開く導線には document_url が要る", () => {
    expect(bad({ document: "text-pdf" })).toBe(false)
    expect(bad({ document: "text-pdf", document_url: "https://www.city.a.lg.jp/a.pdf" })).toBe(true)
  })
  it("画像の PDF は searchable にできない", () => {
    expect(bad({ target: "pdf", document: "image-pdf", searchable: true })).toBe(false)
  })
  it("地区を選ぶ入口は版を持たず、searchable にしない", () => {
    expect(bad({ scope: "area-selector", searchable: false, edition: { value: "2026", precision: "year" } })).toBe(false)
    expect(bad({ scope: "area-selector", searchable: true })).toBe(false)
    expect(bad({ scope: "area-selector", searchable: false })).toBe(true)
  })
  it("地区だけの資料は値として持てない", () => {
    expect(bad({ scope: "area-only" })).toBe(false)
  })
  it("search・app・top は document が決まっている", () => {
    expect(bad({ kind: "search", document: "html", searchable: false })).toBe(false)
    expect(bad({ kind: "app", document: "app", searchable: false })).toBe(true)
    expect(bad({ kind: "top", document: "search", searchable: false })).toBe(false)
  })
  it("ラベルは日英そろえる", () => {
    expect(bad({ label_ja: "一覧" })).toBe(false)
    expect(bad({ label_ja: "一覧", label_en: "List" })).toBe(true)
  })
  it("版の値は細かさと合い、実在して、始まりが未来でない", () => {
    expect(bad({ edition: { value: "2026-04", precision: "day" } })).toBe(false)
    expect(bad({ edition: { value: "2026-02-30", precision: "day" } })).toBe(false)
    expect(bad({ edition: { value: "2999", precision: "fiscal-year" } })).toBe(false)
    expect(bad({ edition: { value: "2026", precision: "fiscal-year" } })).toBe(true)
  })
})

describe("OfficialGuideEntrySchema", () => {
  it("導線か電話のどちらかが要る", () => {
    expect(OfficialGuideEntrySchema.safeParse({ checked_at: "2026-11-04", links: [], source: "t" }).success).toBe(false)
  })
  it("種類は1件まで", () => {
    expect(
      OfficialGuideEntrySchema.safeParse({ checked_at: "2026-11-04", links: [link(), link()], source: "t" }).success
    ).toBe(false)
  })
  it("電話番号の形", () => {
    const phone = (tel: string) => ({
      dept_ja: "ごみ減量課",
      tel,
      source_url: "https://www.city.a.lg.jp/",
      checked_at: "2026-11-04",
    })
    const ok = (tel: string) =>
      OfficialGuideEntrySchema.safeParse({ checked_at: "2026-11-04", phone: phone(tel), source: "t" }).success
    expect(ok("03-1234-5678")).toBe(true)
    expect(ok("0120-264-057")).toBe(true)
    expect(ok("03(1234)5678")).toBe(false)
    expect(ok("1234-5678")).toBe(false)
  })
})

describe("officialGuideProblems: 止まる例", () => {
  const problems = (over: Partial<GuideFiles>, r = registry3) => officialGuideProblems(files(over), r)
  it("対応済みの市に導線が残っている", () => {
    expect(problems({ guides: { s: entry([link({ url: "https://www.city.s.lg.jp/x.html" })]) } }).join()).toMatch(/対応済み/)
  })
  it("別の市のホスト(導線の無い市・対応済みの市を含む)", () => {
    expect(problems({ guides: { a: entry([link({ url: "https://www.city.b.lg.jp/x.html" })]) } }).join()).toMatch(/別の市\(b\)/)
    expect(problems({ guides: { a: entry([link({ url: "https://www.city.s.lg.jp/x.html" })]) } }).join()).toMatch(/別の市\(s\)/)
  })
  it("1つのホストが2つの市に属する", () => {
    const f = files()
    f.hosts.b.hosts = ["www.city.a.lg.jp"]
    f.hosts.b.top_url = null
    expect(officialGuideProblems(f, registry3).join()).toMatch(/2つの市/)
  })
  it("外部のホストに via が無い・許可の一覧に無い・ホストが違う・紹介元が市でない", () => {
    const ext = "https://www.gomisaku.jp/0001/"
    expect(problems({ guides: { a: entry([link({ kind: "search", document: "search", searchable: false, url: ext })]) } }).join()).toMatch(/via が要ります/)
    expect(
      problems({
        guides: { a: entry([link({ kind: "search", document: "search", searchable: false, url: ext, via: { id: "nope", linked_from: "https://www.city.a.lg.jp/" } })]) },
      }).join()
    ).toMatch(/許可の一覧に無い/)
    expect(
      problems({
        guides: { a: entry([link({ kind: "search", document: "search", searchable: false, url: "https://other.example.jp/", via: { id: "gomisaku", linked_from: "https://www.city.a.lg.jp/" } })]) },
      }).join()
    ).toMatch(/ホストと違います/)
    expect(
      problems({
        guides: { a: entry([link({ kind: "search", document: "search", searchable: false, url: ext, via: { id: "gomisaku", linked_from: "https://www.city.b.lg.jp/" } })]) },
      }).join()
    ).toMatch(/linked_from/)
  })
  it("中の資料・最終の行き先が別のホスト", () => {
    expect(
      problems({
        guides: { a: entry([link({ document: "text-pdf", document_url: "https://www.city.b.lg.jp/a.pdf" })]) },
      }).join()
    ).toMatch(/document_url/)
    expect(problems({ guides: { a: entry([link({ final_url: "https://evil.example.com/" })]) } }).join()).toMatch(/final_url/)
  })
  it("電話を確かめたページが市のホストでない", () => {
    const g = entry([], {
      phone: { dept_ja: "ごみ減量課", tel: "03-1234-5678", source_url: "https://www.city.b.lg.jp/", checked_at: "2026-11-04" },
    })
    expect(problems({ guides: { a: g } }).join()).toMatch(/電話/)
  })
  it("市のホストの表がレジストリと過不足なく対応しない・予定の表に知らない slug", () => {
    expect(officialGuideProblems(files(), [...registry3, reg("c", "unsupported")]).join()).toMatch(/表に無い市区町村: c/)
    expect(problems({ reviews: [{ slug: "zz", due: "2027-03-01", reason_ja: "t" }] }).join()).toMatch(/予定の表/)
  })
})

describe("officialGuideProblems: 通る例", () => {
  it("外部のサイトを、市のページの案内つきで載せる(堺市の形)", () => {
    const g = entry([
      link({
        kind: "search",
        document: "search",
        searchable: false,
        url: "https://www.gomisaku.jp/0001/",
        via: { id: "gomisaku", linked_from: "https://www.city.a.lg.jp/gomi/" },
      }),
      link({ kind: "top", document: "html", searchable: false, url: "https://www.city.a.lg.jp/gomi/" }),
    ])
    expect(officialGuideProblems(files({ guides: { a: g } }), registry3)).toEqual([])
  })
  it("official_url が null でも、人が確かめた市のホストがあれば通る", () => {
    const r = [reg("a", "unsupported", null), registry3[1], registry3[2]]
    expect(officialGuideProblems(files({ guides: { a: entry([link()]) } }), r)).toEqual([])
  })
})

describe("toPublicGuides: 画面に渡す項目だけ", () => {
  it("中の資料の URL・紹介元・目印・電話を確かめたページ・作った記録を渡さない。種類の順に並べる", () => {
    const g = entry(
      [
        link({ kind: "top", document: "html", searchable: false, url: "https://www.city.a.lg.jp/gomi/" }),
        link({
          document: "text-pdf",
          document_url: "https://www.city.a.lg.jp/a.pdf",
          document_link_text: "一覧",
          document_sha256: "a".repeat(64),
          known_stop_contexts: ["サービス休止情報"],
          edition: { value: "2020-04", precision: "month" },
        }),
        link({
          kind: "search",
          document: "search",
          searchable: false,
          url: "https://www.gomisaku.jp/0001/",
          final_url: "https://www.gomisaku.jp/0001/",
          via: { id: "gomisaku", linked_from: "https://www.city.a.lg.jp/gomi/" },
        }),
      ],
      { phone: { dept_ja: "ごみ減量課", tel: "03-1234-5678", source_url: "https://www.city.a.lg.jp/x", checked_at: "2026-11-04" } }
    )
    const pub = toPublicGuides(g, files().services, "2026-11-04")
    const text = JSON.stringify(pub)
    for (const hidden of ["a.pdf", "linked_from", "document_sha256", "サービス休止情報", "source", "/x"])
      expect(text).not.toContain(hidden)
    expect(pub.links.map((l) => l.kind)).toEqual(["search", "list", "top"])
    expect(pub.links[0].via_name_ja).toBe("ごみサク")
    expect(pub.links[1].edition_old).toBe(true)
    expect(pub.phone?.tel).toBe("03-1234-5678")
  })
})

describe("版と電話の表示", () => {
  it("版の表示", () => {
    expect(formatEdition({ value: "2026-04-01", precision: "day" }, "ja")).toBe("2026年4月1日版")
    expect(formatEdition({ value: "2026-04", precision: "month" }, "en")).toBe("April 2026 edition")
    expect(formatEdition({ value: "2026", precision: "fiscal-year" }, "ja")).toBe("2026年度版")
  })
  it("版の終わりの日から2年より前なら古い(年度は翌年の3月31日まで)", () => {
    expect(isOldEdition({ value: "2024-11-03", precision: "day" }, "2026-11-04")).toBe(true)
    expect(isOldEdition({ value: "2024-11-04", precision: "day" }, "2026-11-04")).toBe(false)
    expect(isOldEdition({ value: "2024-11", precision: "month" }, "2026-11-04")).toBe(false)
    expect(isOldEdition({ value: "2024", precision: "fiscal-year" }, "2026-11-04")).toBe(false)
    expect(isOldEdition({ value: "2023", precision: "fiscal-year" }, "2026-11-04")).toBe(true)
  })
  it("電話のリンクは数字だけ", () => {
    expect(telHref("0120-264-057")).toBe("tel:0120264057")
  })
})

describe("画面の文言", () => {
  it("導線・電池・手放すの文言が日英そろっている", () => {
    const ja = ui("ja")
    const en = ui("en")
    const keys = Object.keys(ja).filter((k) => /^(guides|battery)\.|^unsupported\.reuse/.test(k))
    expect(keys.length).toBeGreaterThan(20)
    for (const k of keys) expect(k in en, k).toBe(true)
    for (const k of Object.keys(en).filter((k) => /^(guides|battery)\./.test(k))) expect(k in ja, k).toBe(true)
    for (const kind of GUIDE_KINDS) expect(ja[`guides.kind.${kind}`]).toBeTruthy()
    for (const doc of GUIDE_DOCUMENTS) expect(ja[`guides.doc.${doc}`]).toBeTruthy()
    expect(ja["guides.doc.top"]).toBeTruthy()
  })
  it("電池の一文は「燃えるごみに混ぜず」(「など」を付けない。2026-11-04 Kaz)", () => {
    expect(ui("ja")["battery.body"]).toBe(
      "出し方は市町村で違います。燃えるごみに混ぜず、市の案内で確かめてください。"
    )
  })
})

describe("リポジトリの4つのファイル", () => {
  const real = readGuideFiles()
  it("レジストリと食い違わない", () => {
    expect(() => assertOfficialGuides(real, registry)).not.toThrow()
  })
  it("決まった順で書かれている(作り直しても同じ)", () => {
    const text = serializeGuideFiles(real, registry)
    expect(readFileSync(join(root, "data/official-guides.json"), "utf-8")).toBe(text.guides)
    expect(readFileSync(join(root, "data/municipal-hosts.json"), "utf-8")).toBe(text.hosts)
    expect(readFileSync(join(root, "data/official-guide-hosts.json"), "utf-8")).toBe(text.services)
    expect(readFileSync(join(root, "data/guide-reviews.json"), "utf-8")).toBe(text.reviews)
  })
  it("電話を載せた市には、2027年3月の見直しの予定がある", () => {
    for (const [slug, g] of Object.entries(real.guides)) {
      if (!g.phone) continue
      expect(real.reviews.some((r) => r.slug === slug && r.due.startsWith("2027-03")), slug).toBe(true)
    }
  })
})

describe("buildHosts", () => {
  it("確かめ済みの記録から作り、人が入れた行は残す。記録の無い市は空", () => {
    const r = [
      reg("a", "unsupported", "https://www.city.a.lg.jp/"),
      reg("b", "unsupported", "https://manage.example.com/x?id=b"),
      reg("s", "supported", "https://www.city.s.lg.jp/gomi/"),
      reg("m", "unsupported", null),
    ]
    const checks = {
      "a https://www.city.a.jp/": {
        candidate: "https://www.city.a.jp/",
        checked_at: "2026-10-15",
        ok: true,
        final_url: "https://www.city.a.lg.jp/index.html",
      },
    }
    const current = {
      m: { top_url: "https://www.vill.m.lg.jp/", hosts: ["www.vill.m.lg.jp"], checked_at: "2026-11-04", basis: "人が確かめた" },
    }
    const h = buildHosts(r, checks, current)
    expect(h.a.top_url).toBe("https://www.city.a.lg.jp/")
    expect(h.a.hosts).toEqual(["www.city.a.jp", "www.city.a.lg.jp"])
    expect(h.b.top_url).toBeNull()
    expect(h.b.hosts).toEqual([])
    expect(h.s.hosts).toEqual(["www.city.s.lg.jp"])
    expect(h.m).toEqual(current.m)
  })
})
