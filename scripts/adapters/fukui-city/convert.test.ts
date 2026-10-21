import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { toStandardCsv } from "./convert"
import { fukuiCityAdapter } from "./index"

const HEAD = "行,音,物品名,キーワード,区分,分類,条件,備考\r\n"

describe("toStandardCsv(福井県の共通8列の CSV、福井市)", () => {
  it("物品名・区分・条件を標準形式の品目・分別区分・注意点にし、連番の ID を振る", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          "あ,あ,アイロン,あいろん,小型家電,,指定場所に持ち込み,\r\n" +
          ",,,,,,,\r\n" +
          "か,か,乾電池,かんでんち,電池類（資源）,,びん・乾電池の日に出す,備考の文\r\n"
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
      "182010",
      "1",
      "アイロン",
      "小型家電",
      "指定場所に持ち込み",
    ])
    // 備考に値があれば、注意点の後ろに原文のまま足す
    expect(rows[2]).toEqual([
      "182010",
      "2",
      "乾電池",
      "電池類（資源）",
      "びん・乾電池の日に出す\n備考の文",
    ])
    expect(rows).toHaveLength(3)
  })
  it("見出しが違えば止める", () => {
    expect(() => toStandardCsv(HEAD.replace("物品名", "品目名"))).toThrow(
      /見出し/
    )
  })
  it("「分類」に値があれば止める", () => {
    expect(() =>
      toStandardCsv(HEAD + "あ,あ,アイロン,あいろん,小型家電,家電,,\r\n")
    ).toThrow(/分類/)
  })
})

describe("福井市のアダプタ(取得済みの CSV で)", () => {
  const items = fukuiCityAdapter.parse(
    readFileSync(join(CACHE_DIR, "fukui-city.csv"), "utf-8")
  )
  const find = (name: string) => items.find((i) => i.name_ja === name)

  it("733品目を読み、区分はすべて区分IDに当たる", () => {
    expect(items).toHaveLength(733)
    for (const item of items)
      for (const row of item.rows)
        expect(
          fukuiCityAdapter.resolveCategoryId(row.category_label)
        ).not.toBeNull()
  })

  it("全部の区分の説明に、越廼・清水地域は別のルールという案内が付く", () => {
    for (const item of items)
      for (const row of item.rows)
        expect(row.note).toContain("越廼・清水地域は")
  })

  it("電池類には 2026-04 からの出す条件(A4・1kg・密封・膨張は窓口)が付く", () => {
    const note = find("モバイルバッテリー")?.rows[0].note ?? ""
    for (const s of ["A4サイズ以下・重さ1kg以下", "密封", "破損・膨張", "黒色のコンテナ"])
      expect(note).toContain(s)
  })

  it("古い行「乾電池(充電式・ボタン式電池)=回収不可」は、注記を先頭に置き、市の原文も残す", () => {
    const note = find("乾電池（充電式・ボタン式電池）")?.rows[0].note ?? ""
    expect(note.startsWith("※もったいナビ注: 市の電池類のページ")).toBe(true)
    expect(note).toContain("市では収集しません。")
    expect(note).toContain("購入先や販売店へ相談して下さい")
  })
})
