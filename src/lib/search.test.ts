import { describe, expect, it } from "vitest"
import {
  createSearcher,
  englishWords,
  katakanaToHiragana,
  normalizeForSearch,
  searchItems,
} from "./search"
import itemsFile from "../../data/municipalities/osaka-city/items.json"
import okinawaItemsFile from "../../data/municipalities/okinawa-city/items.json"
import { ItemsFileSchema, SearchIndexFileSchema } from "./schemas"
import { toSearchIndex } from "./public-data"

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
  const index = SearchIndexFileSchema.parse(
    toSearchIndex(ItemsFileSchema.parse(itemsFile).items)
  )
  const fuse = createSearcher(index)

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

  // Phase 4 完了条件: 英語での検索ヒット
  it("「sofa」でソファーがヒットする", () => {
    const names = searchItems(fuse, "sofa").map((i) => i.n)
    expect(names.some((n) => n.includes("ソファー"))).toBe(true)
  })

  it("「battery」で電池系がヒットする", () => {
    const names = searchItems(fuse, "battery").map((i) => i.n)
    expect(
      names.some((n) => n.includes("電池") || n.includes("バッテリー"))
    ).toBe(true)
  })

  it("「guitar」でギターがヒットする", () => {
    const names = searchItems(fuse, "guitar").map((i) => i.n)
    expect(names.some((n) => n.includes("ギター"))).toBe(true)
  })
})

describe("englishWords", () => {
  it("小文字にして、英数字以外で語に分ける", () => {
    expect(englishWords("Oil (cooking oil etc.)")).toEqual([
      "oil",
      "cooking",
      "oil",
      "etc",
    ])
    expect(englishWords("Pipe-frame bed")).toEqual(["pipe", "frame", "bed"])
  })
  it("複数形をそろえる", () => {
    expect(englishWords("Batteries / Bottles")).toEqual(["battery", "bottle"])
    expect(englishWords("Glass")).toEqual(["glass"])
  })
  it("全角の英数字も同じ語になる", () => {
    expect(englishWords("ＰＥＴ")).toEqual(["pet"])
  })
})

// 英語の検索は語単位で照合する(品目名すべてに英訳がある沖縄市のデータで確認)
describe("英語の検索(語単位)", () => {
  const index = SearchIndexFileSchema.parse(
    toSearchIndex(ItemsFileSchema.parse(okinawaItemsFile).items)
  )
  const searcher = createSearcher(index)
  const en = (q: string) => searchItems(searcher, q).map((i) => i.e ?? i.n)

  it("語をまたいだ一致は出さない(gas で containing asbestos が出ない)", () => {
    const names = en("gas")
    expect(names[0]).toMatch(/^Gas /)
    expect(names).not.toContain("Products containing asbestos")
  })

  it("語の途中の一致は短い検索語では出さない(oil で Soil が出ない)", () => {
    const names = en("oil")
    expect(names[0]).toBe("Oil (cooking oil etc.)")
    expect(names).not.toContain("Soil")
    expect(names).toContain("Engine oil")
  })

  it("似ているだけの語は出さない(sofa で Soap、battery で Pottery が出ない)", () => {
    expect(en("sofa")).toEqual(["Sofa", "Sofa bed"])
    expect(en("battery").every((n) => /batter/i.test(n))).toBe(true)
  })

  it("語がそのまま一致する品目を、語の先頭だけが一致する品目より上に並べる", () => {
    const names = en("can")
    expect(names[0]).toBe("Can (beverage, food)")
    expect(names.indexOf("Trash can")).toBeLessThan(names.indexOf("Candle"))
  })

  it("別名(PET)で当たる品目を上に並べる", () => {
    const names = en("PET")
    expect(names[0]).toMatch(/PET bottle/)
    expect(names).toContain("Pet collar")
    expect(en("ＰＥＴ")).toEqual(names)
  })

  it("複数の語は、すべての語が当たる品目だけ出す", () => {
    expect(en("cell phone")).toEqual(["Cell phone (mobile phone)"])
    expect(en("pet bottle").every((n) => /PET bottle/.test(n))).toBe(true)
  })

  it("語を続けて書いても当たる(sofabed、cellphone)", () => {
    expect(en("sofabed")).toEqual(["Sofa bed"])
    expect(en("cellphone")).toEqual(["Cell phone (mobile phone)"])
  })

  it("複数形と1文字の打ち間違いでも当たる", () => {
    expect(en("batteries")).toContain("Battery (button cell)")
    expect(en("batery")).toContain("Battery (button cell)")
    expect(en("umbrela")).toEqual(["Umbrella", "Beach umbrella"])
  })

  it("語の途中の一致は、長い検索語なら後ろに出す(phone で Earphones)", () => {
    const names = en("phone")
    expect(names).toContain("Earphones")
    expect(names.indexOf("Cell phone (mobile phone)")).toBeLessThan(
      names.indexOf("Earphones")
    )
  })

  it("日本語名に含まれる英数字にも当たる(IH で IHコンロ)", () => {
    expect(searchItems(searcher, "IH").map((i) => i.n)).toContain("IHコンロ")
  })

  it("日本語の検索語は従来どおり(かな・漢字・別名のあいまい検索)", () => {
    const ja = (q: string) => searchItems(searcher, q).map((i) => i.n)
    expect(ja("ソファ").slice(0, 2)).toEqual(["ソファー", "ソファーベッド"])
    expect(ja("ふとん")[0]).toBe("布団")
    expect(ja("電池")).toContain("電池（ボタン型）")
  })
})
