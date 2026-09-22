import { describe, expect, it } from "vitest"
import { parseCsv } from "./csv"

describe("parseCsv", () => {
  it("基本の行と列", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ])
  })
  it("引用符内の改行・カンマ・二重引用符を1セルとして扱う", () => {
    const text =
      '1,あ,"珪藻土は燃えない。\nただし""石綿""は不可、販売店へ",x\r\n2,い,y,z'
    expect(parseCsv(text)).toEqual([
      ["1", "あ", '珪藻土は燃えない。\nただし"石綿"は不可、販売店へ', "x"],
      ["2", "い", "y", "z"],
    ])
  })
  it("BOM と末尾改行なしに対応", () => {
    expect(parseCsv("﻿a,b\n1,")).toEqual([
      ["a", "b"],
      ["1", ""],
    ])
  })
  it("閉じていない引用符はエラー", () => {
    expect(() => parseCsv('a,"b\nc')).toThrow()
  })
})
