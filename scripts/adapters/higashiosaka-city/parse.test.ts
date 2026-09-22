import { describe, expect, it } from "vitest"
import categories from "../../../data/municipalities/higashiosaka-city/categories.json"
import {
  CATEGORY_NAME,
  LABEL_TO_ID,
  OFFICIAL_LINK,
  resolveCategoryId,
} from "./category-map"
import { buildNote, parseHigashiosakaCsv, readRows } from "./parse"

const P = "ゴミの分別方法_"
const HEADER =
  "﻿" +
  [
    "全国地方公共団体コード",
    "ID",
    "品目",
    "分別区分",
    "注意点",
    "料金種別",
    "料金",
    "料金備考",
    "備考",
  ]
    .map((h) => P + h)
    .join(",") +
  "\n"

describe("resolveCategoryId", () => {
  it("表記ゆれ(全角括弧・かな違い)を同じ区分に寄せる", () => {
    expect(resolveCategoryId("家庭ごみ(もえる物)")).toBe("katei")
    expect(resolveCategoryId("家庭ごみ(もえるもの）")).toBe("katei")
    expect(resolveCategoryId("不燃の小物（燃えないごみ）")).toBe("funen")
    expect(resolveCategoryId("かんびん")).toBe("kan-bin")
    expect(resolveCategoryId("JBRCの回収協力店の回収ＢＯＸへ")).toBe(
      "kyoryokuten"
    )
  })
  it("未知ラベルは null", () => {
    expect(resolveCategoryId("謎の区分")).toBeNull()
  })
})

describe("buildNote", () => {
  it("不可は注意点が無くても「市では収集しません」を必ず入れる(注意文言の欠落防止)", () => {
    expect(buildNote("不可", "fuka", "")).toBe("市では収集しません。")
    expect(buildNote("不可", "fuka", "販売店等に相談してください。")).toBe(
      "市では収集しません。\n販売店等に相談してください。"
    )
  })
  it("表記ゆれだけのラベルは表記を足さない", () => {
    expect(buildNote("かんびん", "kan-bin", "")).toBeNull()
    expect(buildNote("大型ごみ", "ogata", "")).toBeNull()
  })
  it("回収協力店の種類・個別指示は市の表記を先頭に残す", () => {
    expect(
      buildNote(
        "JBRCの回収協力店の回収ＢＯＸへ",
        "kyoryokuten",
        "販売店等に相談してください。"
      )
    ).toBe(
      "出し方: JBRCの回収協力店の回収ＢＯＸへ。\n販売店等に相談してください。"
    )
    expect(buildNote("在宅医療廃棄物収集", "kobetsu", "")).toBe(
      "出し方: 在宅医療廃棄物収集。"
    )
  })
})

describe("parseHigashiosakaCsv", () => {
  it("BOM 付き・引用符内の改行を含む CSV を読む", () => {
    const text =
      HEADER +
      '272272,,携帯電話,小型家電回収ボックス,"回収ボックスへ。\n\n\n詳しくはこちら\nhttps://www.city.higashiosaka.lg.jp/0000012601.html",,,,\n' +
      "272272,,ソファー,大型ごみ,,,,,\n"
    const items = parseHigashiosakaCsv(text)
    expect(items.map((i) => i.name_ja)).toEqual(["携帯電話", "ソファー"])
    expect(items[0].rows[0].note).toBe(
      "回収ボックスへ。\n\n詳しくはこちら\nhttps://www.city.higashiosaka.lg.jp/0000012601.html"
    )
    expect(items[1].rows[0].official_link).toBe(OFFICIAL_LINK.ogata)
  })
  it("列構成が違えばエラー", () => {
    expect(() => readRows("品目,分別区分\na,b\n")).toThrow()
  })
})

describe("category-map と categories.json の整合", () => {
  it("マップ先・公式リンク・表示名の区分IDがすべて categories.json にあり、名前が一致する", () => {
    const byId = new Map(categories.map((c) => [c.id, c]))
    for (const id of Object.values(LABEL_TO_ID)) expect(byId.has(id)).toBe(true)
    for (const c of categories) {
      expect(OFFICIAL_LINK[c.id]).toBeTruthy()
      expect(CATEGORY_NAME[c.id]).toBe(c.name_ja)
    }
  })
})
