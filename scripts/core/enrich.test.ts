import { describe, expect, it } from "vitest"
import {
  createItemsEnLookup,
  extractSodaiFee,
  findUnusedKeys,
  itemNameKey,
  inferReuseCategory,
  katakanaToHiragana,
} from "./enrich"

describe("katakanaToHiragana", () => {
  it("カタカナをひらがなに変換する", () => {
    expect(katakanaToHiragana("ギター")).toBe("ぎたー")
    expect(katakanaToHiragana("ソファー")).toBe("そふぁー")
  })
  it("ひらがな・漢字・英数はそのまま", () => {
    expect(katakanaToHiragana("絵本abc123")).toBe("絵本abc123")
  })
})

describe("extractSodaiFee", () => {
  it("処理手数料を抽出する", () => {
    expect(extractSodaiFee("処理手数料 1台400円")).toBe(400)
    expect(extractSodaiFee("処理手数料:1,000円")).toBe(1000)
  })
  it("手数料表記が無ければ null", () => {
    expect(extractSodaiFee("30cmを超えるものは粗大ごみ")).toBeNull()
    expect(extractSodaiFee(null)).toBeNull()
  })
})

describe("findUnusedKeys", () => {
  it("どの品目名とも一致しないキーを返す", () => {
    expect(
      findUnusedKeys({ 椅子: "Chair", イス: "Chair", 机: "Desk" }, [
        "椅子",
        "机",
        "畳",
      ])
    ).toEqual(["イス"])
  })
  it("すべて一致すれば空", () => {
    expect(findUnusedKeys({ 椅子: "Chair" }, ["椅子"])).toEqual([])
    expect(findUnusedKeys({}, ["椅子"])).toEqual([])
  })
  it("全角・半角の括弧の違いは一致とみなす", () => {
    expect(
      findUnusedKeys({ "植木鉢（陶器製）": "Flowerpot (ceramic)" }, [
        "植木鉢(陶器製)",
      ])
    ).toEqual([])
  })
})

describe("itemNameKey", () => {
  it("全角・半角の括弧と英数字、空白の違いを吸収する", () => {
    expect(itemNameKey("植木鉢（陶器製）")).toBe(itemNameKey("植木鉢(陶器製)"))
    expect(itemNameKey("ＣＤ プレーヤー")).toBe("CDプレーヤー")
  })
  it("別の品目名は別のまま", () => {
    expect(itemNameKey("植木鉢(陶器製)")).not.toBe(
      itemNameKey("植木鉢(プラスチック)")
    )
  })
})

describe("createItemsEnLookup", () => {
  const common = { 椅子: "Chair", "植木鉢（陶器製）": "Flowerpot (ceramic)" }
  it("品目名で引く。無ければ null", () => {
    const lookup = createItemsEnLookup(common)
    expect(lookup("椅子")).toBe("Chair")
    expect(lookup("机")).toBeNull()
  })
  it("表記ゆれ(半角の括弧)でも当たる", () => {
    expect(createItemsEnLookup(common)("植木鉢(陶器製)")).toBe(
      "Flowerpot (ceramic)"
    )
  })
  it("後に渡した辞書(自治体の辞書)が優先", () => {
    const lookup = createItemsEnLookup(common, { 椅子: "Chair (wooden)" })
    expect(lookup("椅子")).toBe("Chair (wooden)")
    expect(lookup("植木鉢（陶器製）")).toBe("Flowerpot (ceramic)")
  })
  it("自治体の辞書は、表記ゆれで当たる場合も共通辞書より優先", () => {
    const lookup = createItemsEnLookup(common, {
      "植木鉢(陶器製)": "Plant pot (ceramic)",
    })
    expect(lookup("植木鉢（陶器製）")).toBe("Plant pot (ceramic)")
  })
})

describe("inferReuseCategory", () => {
  it("small-appliance kind → small-appliance", () => {
    expect(
      inferReuseCategory("ギターアンプ", ["small-appliance"], [null])
    ).toBe("small-appliance")
  })
  it("楽器名 → instruments(小型家電区分が無い場合)", () => {
    expect(inferReuseCategory("ギター", ["bulky"], [null])).toBe("instruments")
  })
  it("bulky kind+家具名 → furniture", () => {
    expect(inferReuseCategory("ソファー", ["bulky"], [null])).toBe("furniture")
  })
  it("絵本 → toys-baby(books-mediaより優先)", () => {
    expect(inferReuseCategory("絵本", ["drop-off"], [null])).toBe("toys-baby")
  })
  it("リターナブル文言 → returnable", () => {
    expect(
      inferReuseCategory(
        "一升びん",
        ["recyclable"],
        ["リターナブルびんは購入店・販売店へ返却してください"]
      )
    ).toBe("returnable")
  })
  it("衣類 → clothing", () => {
    expect(inferReuseCategory("子ども服", ["paper"], [null])).toBe("clothing")
  })
  it("申込制でない大型品の区分(largeItem)+家具名 → furniture", () => {
    expect(
      inferReuseCategory("タンス", ["non-burnable"], [null], { largeItem: true })
    ).toBe("furniture")
    // 印のない不燃ごみは従来どおり家具にしない
    expect(inferReuseCategory("タンス", ["non-burnable"], [null])).toBeNull()
  })
  it("「イス」を含むだけの品目(アイス・スライス)を furniture にしない", () => {
    expect(inferReuseCategory("アイスピック", ["bulky"], [null])).toBeNull()
    expect(
      inferReuseCategory("アイスピック", ["non-burnable"], [null], {
        largeItem: true,
      })
    ).toBeNull()
    expect(inferReuseCategory("スライスカッター", ["bulky"], [null])).toBeNull()
    expect(inferReuseCategory("パイプいす", ["bulky"], [null])).toBe(
      "furniture"
    )
  })
  it("該当なし → null", () => {
    expect(inferReuseCategory("生ごみ", ["burnable"], [null])).toBeNull()
  })

  // 実データで見つかった誤検知の回帰テスト
  it("「本体」「日本」を含む品目を books-media にしない", () => {
    expect(
      inferReuseCategory(
        "ベッド本体(マットレス類を除く。ベッドは解体してください)",
        ["bulky"],
        [null]
      )
    ).toBe("furniture")
    expect(
      inferReuseCategory(
        "紙パック(日本酒などの、内側がアルミコーティングされているもの)",
        ["burnable"],
        [null]
      )
    ).toBeNull()
    expect(
      inferReuseCategory(
        "パソコン本体・ディスプレイ",
        ["maker-recycle"],
        [null]
      )
    ).toBeNull()
    // PCリサイクル(メーカー回収)は市の小型家電回収と別制度。small-appliance を案内しない
  })
  it("衣装ケース・衣類乾燥機・薬(服用)を clothing にしない", () => {
    expect(
      inferReuseCategory("衣装ケース(衣装箱)", ["bulky"], [null])
    ).toBeNull()
    expect(
      inferReuseCategory("衣類乾燥機", ["not-collected"], [null])
    ).toBeNull()
    expect(
      inferReuseCategory(
        "薬(粉薬、錠剤で、服用する必要がなくなり余った場合)",
        ["burnable"],
        [null]
      )
    ).toBeNull()
  })
  it("CDケースは books-media にしないが、CD・週刊誌はする", () => {
    expect(inferReuseCategory("CDケース", ["plastic"], [null])).toBeNull()
    expect(inferReuseCategory("CD", ["burnable"], [null])).toBe("books-media")
    expect(inferReuseCategory("週刊誌", ["paper"], [null])).toBe("books-media")
  })
  it("ガスコンロ・ガステーブルを furniture にしない", () => {
    expect(
      inferReuseCategory("ガスコンロ・ガステーブル", ["bulky"], [null])
    ).toBeNull()
  })
  it("収納系(カラーボックス・ラック)は furniture", () => {
    expect(
      inferReuseCategory(
        "カラーボックス(最大の辺または径が30センチメートルを超えるもの)",
        ["bulky"],
        [null]
      )
    ).toBe("furniture")
    expect(inferReuseCategory("押入れ収納ラック", ["bulky"], [null])).toBe(
      "furniture"
    )
  })
  it("子ども用遊具・三輪車は toys-baby", () => {
    expect(
      inferReuseCategory("子ども用遊具(ジム、滑り台等)", ["bulky"], [null])
    ).toBe("toys-baby")
    expect(inferReuseCategory("三輪車", ["burnable"], [null])).toBe("toys-baby")
  })
})
