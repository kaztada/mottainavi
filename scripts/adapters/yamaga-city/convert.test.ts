import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { EXPECTED_HEADER, toStandardCsv } from "./convert"

const HEAD = "﻿" + EXPECTED_HEADER.join(",") + "\r\n"

describe("toStandardCsv(山鹿市の独自の9列 → 標準形式の列の並び)", () => {
  it("品名・ごみ区分・ポイントを標準形式の列に入れる", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          "432083,0000000001,熊本県,山鹿市,あ,ICカード,アイシーカード,燃やすごみ,はさみで細かく切って捨てましょう。\r\n" +
          "432083,0000000002,熊本県,山鹿市,か,乾電池,カンデンチ,電池類,\r\n"
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
      "432083",
      "0000000001",
      "ICカード",
      "燃やすごみ",
      "はさみで細かく切って捨てましょう。",
    ])
    expect(rows[2]).toEqual(["432083", "0000000002", "乾電池", "電池類", ""])
  })

  it("見出しが変わったら止める", () => {
    const changed = HEAD.replace("ポイント", "注意点")
    expect(() => toStandardCsv(changed)).toThrow(/見出し/)
  })

  it("列数が違う行があれば止める", () => {
    expect(() =>
      toStandardCsv(HEAD + "432083,1,熊本県,山鹿市,あ,ICカード,燃やすごみ\r\n")
    ).toThrow(/列数/)
  })
})
