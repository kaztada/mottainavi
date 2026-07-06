import { describe, expect, it } from "vitest"
import {
  extractSodaiFee,
  inferReuseCategory,
  katakanaToHiragana,
} from "./enrich"
import { normalizeLabel, resolveCategoryId } from "./category-map"

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

describe("resolveCategoryId / normalizeLabel", () => {
  it("全角括弧・空白ゆらぎを吸収して解決する", () => {
    expect(resolveCategoryId("小型家電リサイクル回収(宅配便)")).toBe(
      "kogata-kaden-takuhai"
    )
    expect(resolveCategoryId(" 普通ごみ ")).toBe("futsu")
    expect(resolveCategoryId("収集しません")).toBe("not-collected")
  })
  it("未知ラベルは null", () => {
    expect(resolveCategoryId("謎の区分")).toBeNull()
  })
  it("normalizeLabel は NFKC+空白除去+括弧統一", () => {
    expect(normalizeLabel("普通 ごみ")).toBe("普通ごみ")
  })
})

describe("inferReuseCategory", () => {
  it("小型家電区分 → small-appliance", () => {
    expect(
      inferReuseCategory("ギターアンプ", ["kogata-kaden-takuhai"], [null])
    ).toBe("small-appliance")
  })
  it("楽器名 → instruments(小型家電区分が無い場合)", () => {
    expect(inferReuseCategory("ギター", ["sodai"], [null])).toBe("instruments")
  })
  it("粗大ごみ+家具名 → furniture", () => {
    expect(inferReuseCategory("ソファー", ["sodai"], [null])).toBe("furniture")
  })
  it("絵本 → toys-baby(books-mediaより優先)", () => {
    expect(inferReuseCategory("絵本", ["kyoten"], [null])).toBe("toys-baby")
  })
  it("リターナブル文言 → returnable", () => {
    expect(
      inferReuseCategory(
        "一升びん",
        ["shigen"],
        ["リターナブルびんは購入店・販売店へ返却してください"]
      )
    ).toBe("returnable")
  })
  it("衣類 → clothing", () => {
    expect(inferReuseCategory("子ども服", ["koshi-irui"], [null])).toBe(
      "clothing"
    )
  })
  it("該当なし → null", () => {
    expect(inferReuseCategory("生ごみ", ["futsu"], [null])).toBeNull()
  })

  // 実データで見つかった誤検知の回帰テスト
  it("「本体」「日本」を含む品目を books-media にしない", () => {
    expect(
      inferReuseCategory(
        "ベッド本体(マットレス類を除く。ベッドは解体してください)",
        ["sodai"],
        [null]
      )
    ).toBe("furniture")
    expect(
      inferReuseCategory(
        "紙パック(日本酒などの、内側がアルミコーティングされているもの)",
        ["futsu"],
        [null]
      )
    ).toBeNull()
    expect(
      inferReuseCategory("パソコン本体・ディスプレイ", ["pc-recycle"], [null])
    ).toBeNull()
  })
  it("衣装ケース・衣類乾燥機・薬(服用)を clothing にしない", () => {
    expect(inferReuseCategory("衣装ケース(衣装箱)", ["sodai"], [null])).toBeNull()
    expect(
      inferReuseCategory("衣類乾燥機", ["not-collected"], [null])
    ).toBeNull()
    expect(
      inferReuseCategory("薬(粉薬、錠剤で、服用する必要がなくなり余った場合)", ["futsu"], [null])
    ).toBeNull()
  })
  it("CDケースは books-media にしないが、CD・週刊誌はする", () => {
    expect(inferReuseCategory("CDケース", ["plastic"], [null])).toBeNull()
    expect(inferReuseCategory("CD", ["futsu"], [null])).toBe("books-media")
    expect(inferReuseCategory("週刊誌", ["koshi-irui"], [null])).toBe(
      "books-media"
    )
  })
  it("ガスコンロ・ガステーブルを furniture にしない", () => {
    expect(
      inferReuseCategory("ガスコンロ・ガステーブル", ["sodai"], [null])
    ).toBeNull()
  })
  it("収納系(カラーボックス・ラック)は furniture", () => {
    expect(
      inferReuseCategory("カラーボックス(最大の辺または径が30センチメートルを超えるもの)", ["sodai"], [null])
    ).toBe("furniture")
    expect(inferReuseCategory("押入れ収納ラック", ["sodai"], [null])).toBe(
      "furniture"
    )
  })
  it("子ども用遊具・三輪車は toys-baby", () => {
    expect(
      inferReuseCategory("子ども用遊具(ジム、滑り台等)", ["sodai"], [null])
    ).toBe("toys-baby")
    expect(inferReuseCategory("三輪車", ["futsu"], [null])).toBe("toys-baby")
  })
})
