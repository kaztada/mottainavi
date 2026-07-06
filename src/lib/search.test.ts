import { describe, expect, it } from "vitest"
import {
  buildSearchEntries,
  createFuse,
  katakanaToHiragana,
  normalizeForSearch,
  searchItems,
} from "./search"
import { SearchIndexFileSchema } from "./schemas"
import rawIndex from "../../data/items/osaka-city.search.json"

describe("normalizeForSearch", () => {
  it("カタカナをひらがなに変換する", () => {
    expect(normalizeForSearch("ギター")).toBe("ぎた")
  })
  it("NFKC正規化する(全角英数→半角)", () => {
    expect(normalizeForSearch("PET")).toBe("pet")
  })
  it("小文字化する", () => {
    expect(normalizeForSearch("iPhone")).toBe("iphone")
  })
  it("長音・スペース(全半角)を除去する", () => {
    expect(normalizeForSearch("ソファー ベッド")).toBe("そふぁべっど")
    expect(normalizeForSearch("モバイル　バッテリー")).toBe("もばいるばってり")
  })
})

describe("katakanaToHiragana", () => {
  it("ひらがな・漢字・英数はそのまま", () => {
    expect(katakanaToHiragana("絵本abc")).toBe("絵本abc")
  })
})

// Phase 2 完了条件の統合テスト: 実データの検索インデックスでヒットを確認
describe("実インデックスでの検索(完了条件)", () => {
  const index = SearchIndexFileSchema.parse(rawIndex)
  const fuse = createFuse(buildSearchEntries(index))

  it("「ぎたー」でギターがヒットする", () => {
    const names = searchItems(fuse, "ぎたー").map((i) => i.n)
    expect(names.some((n) => n.includes("ギター"))).toBe(true)
  })

  it("「PET」でペットボトルがヒットする", () => {
    const names = searchItems(fuse, "PET").map((i) => i.n)
    expect(names.some((n) => n.includes("ペットボトル"))).toBe(true)
  })

  it("「iron」でアイロンがヒットする", () => {
    const names = searchItems(fuse, "iron").map((i) => i.n)
    expect(names.some((n) => n.includes("アイロン"))).toBe(true)
  })

  it("「そふぁ」でソファーがヒットする", () => {
    const names = searchItems(fuse, "そふぁ").map((i) => i.n)
    expect(names.some((n) => n.includes("ソファー"))).toBe(true)
  })

  it("「えあこん」でエアコン(収集しません)がヒットする", () => {
    const results = searchItems(fuse, "えあこん")
    const aircon = results.find((i) => i.n === "エアコン")
    expect(aircon).toBeDefined()
    expect(aircon!.c).toContain("not-collected")
  })

  it("空クエリは空配列", () => {
    expect(searchItems(fuse, "  ")).toEqual([])
  })
})
