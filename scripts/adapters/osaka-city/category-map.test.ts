import { describe, expect, it } from "vitest"
import categories from "../../../data/municipalities/osaka-city/categories.json"
import { LABEL_TO_ID, normalizeLabel, resolveCategoryId } from "./category-map"

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

describe("大阪市 category-map と categories.json の整合", () => {
  it("マップ先の区分IDがすべて categories.json に存在する", () => {
    const ids = new Set(categories.map((c) => c.id))
    for (const id of Object.values(LABEL_TO_ID)) expect(ids.has(id)).toBe(true)
  })
})
