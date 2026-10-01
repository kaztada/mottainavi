import { describe, expect, it } from "vitest"
import {
  compareWithGomisaku,
  normalizeName,
  parseGomisakuJs,
  toGomisakuItems,
} from "./gomisaku"

const js = (kind: string, dict: { key: string[]; string: unknown[] }[]) =>
  `gomisakuGetData('${kind}',${JSON.stringify({ "@attributes": { version: "1.0" }, array: { dict } })})`

const typeJs = js("type", [
  { key: ["name", "typeID"], string: ["可燃ごみ", "1"] },
  { key: ["name", "typeID"], string: ["不燃ごみ", "2"] },
  { key: ["name", "typeID"], string: ["粗大ごみ", "3"] },
  { key: ["name", "typeID"], string: ["金属", "4"] },
])
const dictJs = js("dictionary", [
  // comment が空のとき、ごみサクは {} を入れる
  { key: ["comment", "name", "typeID"], string: [{}, "アルミ箔", "2"] },
  { key: ["comment", "name", "typeID"], string: ["", "輪ゴム", "1"] },
  { key: ["comment", "name", "typeID"], string: ["", "油とり紙", "1"] },
  { key: ["comment", "name", "typeID"], string: ["", "ギター", "3"] },
  { key: ["comment", "name", "typeID"], string: ["", "タンス", "3"] },
  { key: ["comment", "name", "typeID"], string: ["", "ハンガー(金属)", "4"] },
  { key: ["comment", "name", "typeID"], string: ["", "モバイルバッテリー", "2"] },
])

describe("parseGomisakuJs / toGomisakuItems", () => {
  it("JS の包みを外して、区分IDを区分名にする", () => {
    expect(parseGomisakuJs(dictJs)[0]).toEqual({
      comment: "",
      name: "アルミ箔",
      typeID: "2",
    })
    expect(toGomisakuItems(dictJs, typeJs)[3]).toEqual({
      name: "ギター",
      type: "粗大ごみ",
    })
  })
})

describe("normalizeName", () => {
  it("かっこ・空白・中黒・全角半角の違いを吸収する", () => {
    expect(normalizeName("ハンガー（金属）")).toBe(normalizeName("ハンガー (金属)"))
    expect(normalizeName("ｱﾙﾐ箔")).toBe("アルミ箔")
  })
})

describe("compareWithGomisaku", () => {
  const gomisaku = toGomisakuItems(dictJs, typeJs)
  const items = [
    { name: "アルミ箔", label: "可燃ごみ" },
    { name: "輪ゴム", label: "可燃ごみ" },
    { name: "油とり紙", label: "可燃ごみ" },
    { name: "タンス", label: "粗大ごみ" },
    { name: "ハンガー（金属）", label: "金属（資源再生物）" },
    { name: "データにしかない品目", label: "可燃ごみ" },
  ]
  const r = compareWithGomisaku(items, gomisaku)

  it("品目名が一致したものだけを数える", () => {
    expect(r.total).toBe(6)
    expect(r.matched).toBe(5)
  })
  it("区分ごとの多数派と違う品目を、食い違いの候補に挙げる", () => {
    expect(r.mismatches).toEqual([
      { name: "アルミ箔", label: "可燃ごみ", gomisakuType: "不燃ごみ" },
    ])
  })
  it("区分名の表記が違っても(かっこ書きの有無)、対応表なしで突き合わせる", () => {
    expect(r.pairs.find((p) => p.label === "金属(資源再生物)")?.types).toEqual([
      { type: "金属", count: 1 },
    ])
  })
  it("ごみサクにだけある品目を出す", () => {
    expect(r.onlyInGomisaku.map((g) => g.name)).toEqual([
      "ギター",
      "モバイルバッテリー",
    ])
  })
  it("件数が同じときは、区分名が同じものを対応する区分とみなす", () => {
    const tie = compareWithGomisaku(
      [
        { name: "輪ゴム", label: "不燃ごみ" },
        { name: "アルミ箔", label: "不燃ごみ" },
      ],
      gomisaku
    )
    expect(tie.mismatches).toEqual([
      { name: "輪ゴム", label: "不燃ごみ", gomisakuType: "可燃ごみ" },
    ])
  })
})
