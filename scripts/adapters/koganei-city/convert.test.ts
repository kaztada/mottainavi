import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { fixTypos, toStandardCsv } from "./convert"

const HEAD =
  "﻿全国地方公共団体コード,ID,品目,分別区分,注意点,料金種別,料金,料金備考,連絡先名称,連絡先電話番号,連絡先内線番号,連絡先メールアドレス,連絡先FormURL,連絡先備考,備考\r\n"

describe("fixTypos(小金井市の注意点の誤字)", () => {
  it("ニカド電池の行の誤字を直す", () => {
    expect(
      fixTypos("袋に入れて「有害」と書く。で着るだけ販売店へ帰してください。プラスチックごみ等には絶対に入れないでください")
    ).toBe("袋に入れて「有害」と書く。できるだけ販売店へ返してください。プラスチックごみ等には絶対に入れないでください")
  })
  it("文末の欠けと句点の抜けを直す", () => {
    expect(fixTypos("電池式のものは、電池を抜いてくださ")).toBe("電池式のものは、電池を抜いてください")
    expect(fixTypos("袋に入れて「有害」と書くできるだけ販売店に返してください")).toBe(
      "袋に入れて「有害」と書く。できるだけ販売店に返してください"
    )
    expect(fixTypos("販売店に返却してください返却できないものは有害ごみとして出してください")).toBe(
      "販売店に返却してください。返却できないものは有害ごみとして出してください"
    )
  })
  it("誤字の無い注意点はそのまま", () => {
    expect(fixTypos("40cmを超えるものは粗大ごみ")).toBe("40cmを超えるものは粗大ごみ")
  })
})

describe("toStandardCsv(小金井市の CSV)", () => {
  it("品目・区分を残し、注意点の誤字だけを直す", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          "132101,1,ぬいぐるみ,燃やすごみ,電池式のものは電池を抜いて燃やさないごみ。40cmを超えるは粗大ごみ,有料袋,,,,,,,,,\r\n"
      )
    )
    expect(rows[1].slice(2, 5)).toEqual([
      "ぬいぐるみ",
      "燃やすごみ",
      "電池式のものは電池を抜いて燃やさないごみ。40cmを超えるものは粗大ごみ",
    ])
  })
  it("見出しが違えば止める", () => {
    expect(() => toStandardCsv("ID,品目,分別区分\r\n1,a,b\r\n")).toThrow(/見出し/)
  })
})
