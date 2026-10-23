import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { toStandardCsv } from "./convert"
import { natoriCityAdapter } from "./index"

const HEAD = "ID,ゴミの品目,分別区分,注意点,料金種別,料金,料金備考,備考\r\n"

describe("toStandardCsv(名取市)", () => {
  it("市コードを足し、品目名の改行を取り、化けた「ℓ」「☎」を戻す", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          '1,"モバイルバッテリー\n（スマートフォン用）",有害・危険ごみ,,,,,\r\n' +
          "2,ホームタンク（200?以内）,粗大ごみ,200?以上のものは、販売店又はメーカーに相談。,,,,\r\n" +
          '3,バイク,処理対象外,"販売店又は二輪車リサイクルコールセンター?050-3000-0727\nに問い合わせ。",,,,\r\n'
      )
    )
    expect(rows[1]).toEqual(["042072", "1", "モバイルバッテリー（スマートフォン用）", "有害・危険ごみ", ""])
    expect(rows[2][2]).toBe("ホームタンク（200ℓ以内）")
    expect(rows[2][4]).toBe("200ℓ以上のものは、販売店又はメーカーに相談。")
    expect(rows[3][4]).toContain("コールセンター☎050-3000-0727")
  })
  it("知らない「?」が残れば止める", () => {
    expect(() => toStandardCsv(HEAD + "1,なにか?,もえるごみ,,,,,\r\n")).toThrow(/文字化け/)
  })
  it("料金種別〜備考に値があれば止める", () => {
    expect(() => toStandardCsv(HEAD + "1,鍋,金属製品類,,有料,,,\r\n")).toThrow(/空の前提/)
  })
})

describe("名取市のアダプタ(取得済みの CSV で)", () => {
  const items = natoriCityAdapter.parse(
    readFileSync(join(CACHE_DIR, "natori-city.csv"), "utf-8")
  )
  it("880品目を読み、区分はすべて区分IDに当たる", () => {
    expect(items).toHaveLength(880)
    for (const item of items)
      for (const row of item.rows)
        expect(natoriCityAdapter.resolveCategoryId(row.category_label)).not.toBeNull()
  })
})
