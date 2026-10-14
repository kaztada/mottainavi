import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { toStandardCsv } from "./convert"

const HEAD = "﻿品　　目,フリガナ,ごみの種類,ごみの出し方\r\n"

describe("toStandardCsv(金沢市の CSV → 標準形式の列)", () => {
  it("見出しを標準形式に直し、品目・区分・出し方をそのまま残す", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          "乾電池,カンデンチ,資源（乾電池および水銀含有製品）,\r\n" +
          "スプレー缶,スプレーカン,資源（スプレー缶・カセットボンベ）,使い切って火気のない屋外で穴をあけて出してください。\r\n"
      )
    )
    expect(rows[0]).toEqual([
      "全国地方公共団体コード",
      "ID",
      "品目",
      "分別区分",
      "注意点",
    ])
    expect(rows[1]).toEqual([
      "172014",
      "",
      "乾電池",
      "資源（乾電池および水銀含有製品）",
      "",
    ])
    expect(rows[2]).toEqual([
      "172014",
      "",
      "スプレー缶",
      "資源（スプレー缶・カセットボンベ）",
      "使い切って火気のない屋外で穴をあけて出してください。",
    ])
  })

  it("出し方のセル内の改行(文の途中の折り返し)をつなぐ", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          '一升びん,イッショウビン,あきびん,"販売店などへお持ち込みいただくか、キャップを外しひと洗いして\n出してください。"\r\n'
      )
    )
    expect(rows[1][4]).toBe(
      "販売店などへお持ち込みいただくか、キャップを外しひと洗いして出してください。"
    )
  })

  it("見出しが変わったら止める", () => {
    expect(() =>
      toStandardCsv("品目,ごみの種類,ごみの出し方\r\n乾電池,資源,\r\n")
    ).toThrow(/見出しが想定と違います/)
  })

  it("列数が違う行があれば止める", () => {
    expect(() => toStandardCsv(HEAD + "乾電池,カンデンチ,資源\r\n")).toThrow(
      /2行目の列数/
    )
  })

  it("文字化けがあれば止める", () => {
    expect(() =>
      toStandardCsv(HEAD + "ござ,ゴザ,燃やすごみ,50�p以上\r\n")
    ).toThrow(/文字化け/)
  })
})
