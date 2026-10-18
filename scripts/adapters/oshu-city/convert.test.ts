import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { fixDoublePeriod, toStandardCsv } from "./convert"

const HEAD = "全国地方公共団体コード,ID,品目,分別区分,注意点,料金種別,料金,料金備考,備考,\r\n"

describe("fixDoublePeriod(奥州市の注意点の「。。」)", () => {
  it("重なった句点を1つにする", () => {
    expect(fixDoublePeriod("小型家電。電池は外すこと。。")).toBe("小型家電。電池は外すこと。")
  })
  it("句点が1つならそのまま", () => {
    expect(fixDoublePeriod("電池を外すこと。")).toBe("電池を外すこと。")
  })
})

describe("toStandardCsv(奥州市の CSV)", () => {
  it("見出しの無い最後の列を落とし、品目・区分・注意点を残す", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          "032158,1,電卓,小型家電,小型家電。電池は外すこと。。,,,,,\r\n" +
          "032158,2,イヤホン,小型家電・燃えないごみ,充電式の場合は小型家電へ。,,,,,\r\n"
      )
    )
    expect(rows[0]).toHaveLength(9)
    expect(rows[1].slice(2, 5)).toEqual(["電卓", "小型家電", "小型家電。電池は外すこと。"])
    expect(rows[2].slice(2, 5)).toEqual([
      "イヤホン",
      "小型家電・燃えないごみ",
      "充電式の場合は小型家電へ。",
    ])
  })

  it("見出しの無い列に値が入ったら止める", () => {
    expect(() => toStandardCsv(HEAD + "032158,1,電卓,小型家電,,,,,,何か\r\n")).toThrow(
      /見出しの無い列/
    )
  })

  it("見出しが違えば止める", () => {
    expect(() => toStandardCsv("ID,品目,分別区分\r\n1,a,b\r\n")).toThrow(/見出し/)
  })
})
