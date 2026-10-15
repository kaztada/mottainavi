import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  COVERAGE_STATUSES,
  CoverageEntrySchema,
  CoverageFileSchema,
  assertCoverageMatchesRegistry,
  countCoverage,
  coverageProblems,
  todayJst,
  toPublicCoverage,
} from "./coverage"
import { formatCheckedAt, reasonKey } from "./coverage-display"
import { RegistryFileSchema, type RegistryEntry } from "./schemas"
import { serializeCoverage } from "../../scripts/core/coverage-file"

const root = join(__dirname, "../..")
const registry = RegistryFileSchema.parse(
  JSON.parse(readFileSync(join(root, "data/municipalities.json"), "utf-8"))
)
const rawCoverage = readFileSync(join(root, "data/coverage.json"), "utf-8")
const coverage = CoverageFileSchema.parse(JSON.parse(rawCoverage))
const ui = (lang: "ja" | "en") =>
  JSON.parse(
    readFileSync(join(root, `data/i18n/ui.${lang}.json`), "utf-8")
  ) as Record<string, string>

const entry = (
  slug: string,
  status: RegistryEntry["status"]
): RegistryEntry => ({
  slug,
  lg_code: "000000",
  pref: "テスト県",
  name_ja: slug,
  name_en: slug,
  status,
  official_url: status === "supported" ? "https://example.jp/" : null,
})

const surveyed = {
  status: "hold",
  checked_at: "2026-10-03",
  evidence: [{ label: "市のオープンデータ" }],
}

describe("台帳の1件の形", () => {
  it("未調査は日付も根拠も無くてよい", () => {
    expect(CoverageEntrySchema.safeParse({ status: "unsurveyed" }).success).toBe(
      true
    )
  })

  it("調べた市は日付と根拠が要る", () => {
    expect(CoverageEntrySchema.safeParse(surveyed).success).toBe(true)
    expect(
      CoverageEntrySchema.safeParse({ ...surveyed, checked_at: undefined })
        .success
    ).toBe(false)
    expect(
      CoverageEntrySchema.safeParse({ ...surveyed, evidence: [] }).success
    ).toBe(false)
  })

  it("見つからない(no-data)は、探した場所が要る", () => {
    const base = { ...surveyed, status: "no-data" }
    expect(CoverageEntrySchema.safeParse(base).success).toBe(false)
    expect(
      CoverageEntrySchema.safeParse({ ...base, searched: [{ label: "BODIK" }] })
        .success
    ).toBe(true)
  })

  it("知らない状態・実在しない日付・未来の日付を拒否する", () => {
    expect(
      CoverageEntrySchema.safeParse({ ...surveyed, status: "done" }).success
    ).toBe(false)
    expect(
      CoverageEntrySchema.safeParse({ ...surveyed, checked_at: "2026-02-30" })
        .success
    ).toBe(false)
    expect(
      CoverageEntrySchema.safeParse({ ...surveyed, checked_at: "2999-01-01" })
        .success
    ).toBe(false)
  })

  it("詳細文は日本語と英語の両方がそろっていないと拒否する", () => {
    expect(
      CoverageEntrySchema.safeParse({ ...surveyed, detail_ja: "事情" }).success
    ).toBe(false)
    expect(
      CoverageEntrySchema.safeParse({
        ...surveyed,
        detail_ja: "事情",
        detail_en: "Reason",
      }).success
    ).toBe(true)
  })

  it("根拠の URL は http(s) だけ", () => {
    const bad = {
      ...surveyed,
      evidence: [{ label: "x", url: "javascript:alert(1)" }],
    }
    expect(CoverageEntrySchema.safeParse(bad).success).toBe(false)
  })
})

describe("全国レジストリの公式サイトの URL", () => {
  it("http(s) 以外を拒否する", () => {
    const e = { ...entry("a-city", "unsupported"), official_url: "ftp://x.jp/" }
    expect(RegistryFileSchema.safeParse([e]).success).toBe(false)
    const ok = { ...e, official_url: "https://www.city.a.lg.jp/" }
    expect(RegistryFileSchema.safeParse([ok]).success).toBe(true)
  })
})

describe("台帳とレジストリの食い違い", () => {
  const reg = [entry("a-city", "supported"), entry("b-city", "unsupported")]
  const unsurveyed = CoverageEntrySchema.parse({ status: "unsurveyed" })

  it("未対応の市が台帳に無ければ止める", () => {
    expect(coverageProblems({}, reg)).toEqual([
      "未対応の自治体が台帳に無い: b-city",
    ])
  })

  it("対応済みの市が台帳に残っていれば止める", () => {
    const p = coverageProblems(
      { "a-city": unsurveyed, "b-city": unsurveyed },
      reg
    )
    expect(p).toEqual([
      "対応済みの自治体が台帳に残っている(台帳から消す): a-city",
    ])
  })

  it("レジストリに無い slug が台帳にあれば止める", () => {
    const p = coverageProblems({ "b-city": unsurveyed, "x-city": unsurveyed }, reg)
    expect(p).toEqual(["レジストリに無い slug が台帳にある: x-city"])
    expect(() =>
      assertCoverageMatchesRegistry({ "x-city": unsurveyed }, reg)
    ).toThrow(/食い違っています/)
  })

  it("いまの台帳とレジストリは食い違いが無い", () => {
    expect(coverageProblems(coverage, registry)).toEqual([])
  })
})

describe("状態ごとの数", () => {
  it("一覧と台帳から別々に数えて、合計が全国の市区町村の数になる", () => {
    const counts = countCoverage(coverage, registry)
    const supported = registry.filter((e) => e.status === "supported").length
    const unsupported = registry.length - supported
    expect(counts.supported).toBe(supported)
    expect(
      COVERAGE_STATUSES.reduce((n, s) => n + counts[s], 0)
    ).toBe(unsupported)
    expect(counts.total).toBe(1741)
  })
})

describe("画面に出す項目", () => {
  it("根拠・探した場所・内部のメモは含めない", () => {
    const e = CoverageEntrySchema.parse({
      ...surveyed,
      detail_ja: "事情",
      detail_en: "Reason",
      searched: [{ label: "BODIK" }],
      note: "内部のメモ",
    })
    expect(toPublicCoverage(e)).toEqual({
      status: "hold",
      checked_at: "2026-10-03",
      detail_ja: "事情",
      detail_en: "Reason",
    })
  })

  it("詳細文・日付が無い市は null", () => {
    const e = CoverageEntrySchema.parse({ status: "unsurveyed" })
    expect(toPublicCoverage(e)).toEqual({
      status: "unsurveyed",
      checked_at: null,
      detail_ja: null,
      detail_en: null,
    })
  })

  it("状態ごとの文が日本語と英語の両方にある", () => {
    for (const lang of ["ja", "en"] as const) {
      const dict = ui(lang)
      for (const s of COVERAGE_STATUSES) {
        expect(dict[reasonKey(s)], `${lang} ${s}`).toBeTruthy()
        expect(dict[`about.coverageStatus.${s}`], `${lang} ${s}`).toBeTruthy()
      }
      expect(dict["unsupported.checkedAt"]).toContain("{date}")
    }
  })

  it("確かめた日の表示", () => {
    expect(formatCheckedAt("2026-10-03", "ja")).toBe("2026年10月3日")
    expect(formatCheckedAt("2026-10-03", "en")).toBe("2026-10-03")
  })
})

describe("台帳のファイルの書き方", () => {
  it("いまのファイルは決まった書き方どおり(同じ内容を書き直しても変わらない)", () => {
    expect(serializeCoverage(coverage, registry)).toBe(rawCoverage)
  })
})

describe("日本時間の今日", () => {
  it("UTC の夜は、日本時間では翌日", () => {
    expect(todayJst(new Date("2026-10-14T16:00:00Z"))).toBe("2026-10-15")
  })
})
