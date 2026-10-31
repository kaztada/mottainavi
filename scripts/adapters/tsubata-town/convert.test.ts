import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { EXPECTED_HEADER, PAPER_LABEL_FIXED, toStandardCsv } from "./convert"
import { tsubataTownAdapter } from "./index"

const HEAD = EXPECTED_HEADER.join(",")
const tail = ",,,,,,,,,,"
const MUST = [
  `173614,1,そり（プラスチック製）,もえるごみ・粗大ごみ,寸法等を確認${tail}`,
  `173614,2,インクカートリッジ,販売店へ返却/もえないごみ,${tail}`,
  `173614,3,ワイシャツ,もえるごみ,50cm以下に切る${tail}`,
  `173614,4,新聞紙,資源ごみ/集団回収,${tail}`,
]
const csv = (...rows: string[]) => [HEAD, ...rows].join("\n") + "\n"

describe("津幡町の変換", () => {
  it("明示した4つだけを直し、ほかの区分と注意点は変えない", () => {
    const out = parseCsv(
      toStandardCsv(csv(...MUST, `173614,5,傘,もえないごみ,布類はもえるごみ${tail}`))
    )
    expect(out[0]).toEqual(EXPECTED_HEADER.slice(0, 5))
    expect(out[1].slice(2)).toEqual([
      "そり（プラスチック製）",
      "もえるごみ/粗大ごみ",
      "寸法等を確認",
    ])
    expect(out[2].slice(2, 4)).toEqual([
      "インクカートリッジ",
      "販売店へ返却/もえるごみ",
    ])
    expect(out[3].slice(2)).toEqual(["ワイシャツ", "もえるごみ", ""])
    expect(out[4][3]).toBe(PAPER_LABEL_FIXED)
    expect(out[5].slice(2)).toEqual(["傘", "もえないごみ", "布類はもえるごみ"])
  })

  it("原本が想定と違えば止まる", () => {
    expect(() =>
      toStandardCsv(
        csv(MUST[0], `173614,2,インクカートリッジ,販売店へ返却/もえるごみ,${tail}`, MUST[2], MUST[3])
      )
    ).toThrow("インクカートリッジ")
    expect(() =>
      toStandardCsv(csv(MUST[0], MUST[1], `173614,3,ワイシャツ,もえるごみ,${tail}`, MUST[3]))
    ).toThrow("ワイシャツ")
    expect(() => toStandardCsv(csv(MUST[0], MUST[1], MUST[3]))).toThrow(
      "ワイシャツ"
    )
    expect(() =>
      toStandardCsv(csv(...MUST, `173614,5,かさ,もえるごみ・もえないごみ,${tail}`))
    ).toThrow("「・」")
    expect(() => toStandardCsv("a,b\n1,2\n")).toThrow("見出し")
  })

  it("収集しない区分の決まり文句は「町では」にする", () => {
    const source = readFileSync(join(CACHE_DIR, "tsubata-town.csv"), "utf-8")
    const items = tsubataTownAdapter.parse(source)
    const notes = items.flatMap((i) => i.rows.map((r) => r.note ?? ""))
    expect(notes.some((n) => n.includes("市では収集しません"))).toBe(false)
    const kaden = items.find((i) => i.name_ja === "エアコン")
    expect(kaden?.rows[0].note?.startsWith("町では収集しません。")).toBe(true)
    expect(kaden?.rows[0].note).toContain("家電リサイクル法")
  })

  it("原本の全行が品目になり、2区分の行は2枚のカードになる", () => {
    const source = readFileSync(join(CACHE_DIR, "tsubata-town.csv"), "utf-8")
    const items = tsubataTownAdapter.parse(source)
    expect(items).toHaveLength(584)
    const ink = items.find((i) => i.name_ja === "インクカートリッジ")
    expect(ink?.rows.map((r) => r.category_label)).toEqual([
      "販売店へ返却",
      "もえるごみ",
    ])
    expect(ink?.rows[0].note).toContain("※もったいナビ注")
    const shirt = items.find((i) => i.name_ja === "ワイシャツ")
    expect(shirt?.rows[0].note).not.toContain("50cm以下に切る")
    const unresolved = items.flatMap((i) =>
      i.rows.filter((r) => !tsubataTownAdapter.resolveCategoryId(r.category_label))
    )
    expect(unresolved).toEqual([])
  })
})
