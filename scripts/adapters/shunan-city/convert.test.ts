import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { stripTelLinks, toStandardCsv } from "./convert"

const HEAD =
  "﻿全国地方公共団体コード,ID,品目,分別区分,注意点,料金種別,料金,料金備考,連絡先名称,連絡先電話番号,連絡先内線番号,連絡先メールアドレス,連絡先FormURL,連絡先備考,備考\r\n"

describe("stripTelLinks(周南市の注意点の HTML タグ)", () => {
  it("電話番号のリンクのタグを外し、番号の文字を残す", () => {
    expect(
      stripTelLinks(
        'パソコン3R推進協会へお問い合わせください。TEL：<a href="tel:0352827685">03-5282-7685</a>小型家電回収ボックス'
      )
    ).toBe("パソコン3R推進協会へお問い合わせください。TEL：03-5282-7685小型家電回収ボックス")
  })

  it("タグの無い注意点はそのまま", () => {
    expect(stripTelLinks("中身を使い切って、穴をあけてください。")).toBe(
      "中身を使い切って、穴をあけてください。"
    )
  })

  it("想定していないタグがあれば止める", () => {
    expect(() => stripTelLinks("詳しくは<br>市のページへ")).toThrow(/HTML タグ/)
  })
})

describe("toStandardCsv(周南市の CSV)", () => {
  it("品目・区分・注意点を残し、注意点のタグだけを外す", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          '352152,1,パソコン　自作パソコン,市が収集しないもの,"TEL：<a href=""tel:0352827685"">03-5282-7685</a>",,,,,,,,,,\r\n' +
          "352152,2,スプレー缶,処理困難物,中身を使い切って、穴をあけてください。,,,,,,,,,,\r\n"
      )
    )
    expect(rows[1].slice(2, 5)).toEqual([
      "パソコン　自作パソコン",
      "市が収集しないもの",
      "TEL：03-5282-7685",
    ])
    expect(rows[2].slice(2, 5)).toEqual([
      "スプレー缶",
      "処理困難物",
      "中身を使い切って、穴をあけてください。",
    ])
  })

  it("見出しが違えば止める", () => {
    expect(() => toStandardCsv("ID,品目,分別区分\r\n1,a,b\r\n")).toThrow(/見出し/)
  })
})
