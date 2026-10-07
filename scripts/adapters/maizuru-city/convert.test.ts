import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { toStandardCsv } from "./convert"

const HEAD =
  "レコード番号,ID,ごみの品目,分別区分,注意点,料金種別,料金,料金備考,備考\r\n"

describe("toStandardCsv(舞鶴市の CSV → 標準形式の見出し)", () => {
  it("見出しを標準形式に直し、品目・区分・注意点をそのまま残す", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          "83,B000000083,乾電池,有害ごみ,,,,,\r\n" +
          "97,B000000097,ライター,有害ごみ,中身を使い切って出す。,,,,\r\n"
      )
    )
    expect(rows[0]).toEqual([
      "全国地方公共団体コード",
      "ID",
      "品目",
      "分別区分",
      "注意点",
    ])
    expect(rows[1]).toEqual(["262021", "B000000083", "乾電池", "有害ごみ", ""])
    expect(rows[2]).toEqual([
      "262021",
      "B000000097",
      "ライター",
      "有害ごみ",
      "中身を使い切って出す。",
    ])
  })

  it("市のデータの文字化け(50cm の cm)を直す", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          "108,B000000108,ござ（燃える素材）,可燃,(い草など)切って可燃ごみとして出す。1辺の長さが50�p以上ある場合は粗大ごみ,,,,\r\n"
      )
    )
    expect(rows[1][4]).toBe(
      "(い草など)切って可燃ごみとして出す。1辺の長さが50cm以上ある場合は粗大ごみ"
    )
  })

  it("ほかの場所に文字化けがあればエラーにする", () => {
    expect(() =>
      toStandardCsv(HEAD + "1,B000000001,なべ,金属類,10�p以下,,,,\r\n")
    ).toThrow(/2行目に文字化け/)
    expect(() =>
      toStandardCsv(HEAD + "1,B000000001,な�べ,金属類,,,,,\r\n")
    ).toThrow(/文字化け/)
  })

  it("見出しが違えばエラーにする(市が列を変えたときに気づけるように)", () => {
    expect(() =>
      toStandardCsv(
        "レコード番号,ID,品目,分別区分,注意点,料金種別,料金,料金備考,備考\n"
      )
    ).toThrow(/見出しが想定と違います/)
    expect(() => toStandardCsv(HEAD.trim() + ",追加の列\n")).toThrow(
      /見出しが想定と違います/
    )
    expect(() => toStandardCsv("")).toThrow(/見出しが想定と違います/)
  })

  it("列数が違う行、料金・備考の列に値がある行はエラーにする", () => {
    expect(() => toStandardCsv(HEAD + "1,B000000001,なべ,金属類\r\n")).toThrow(
      /2行目の列数/
    )
    expect(() =>
      toStandardCsv(HEAD + "1,B000000001,なべ,金属類,,,,,集積所へ\r\n")
    ).toThrow(/料金・備考の列に値があります/)
  })
})
