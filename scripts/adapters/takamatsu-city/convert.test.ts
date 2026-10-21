import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { toStandardCsv } from "./convert"
import { takamatsuCityAdapter } from "./index"

const HEAD = '﻿"#property","name","classification","note"\r\n'

describe("toStandardCsv(高松市の CSV)", () => {
  it("4列を標準形式にし、市の通番を ID に使う。品目名も区分も空の行は除く", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          '"1","ＩＣレコーダー","破砕ごみ","小型家電として回収ボックスに投入できます"\r\n' +
          '"188","ござ（プラスチック製）","破砕、臨時・粗大","指定収取袋に入れる\r\n入らないものは「臨時・粗大ごみ」"\r\n' +
          '"635","","",""\r\n'
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
      "372013",
      "1",
      "ＩＣレコーダー",
      "破砕ごみ",
      "小型家電として回収ボックスに投入できます",
    ])
    // 注意点の文字(書き損じ「指定収取袋」も)は変えず、改行コードだけそろえる
    expect(rows[2]).toEqual([
      "372013",
      "188",
      "ござ（プラスチック製）",
      "破砕、臨時・粗大",
      "指定収取袋に入れる\n入らないものは「臨時・粗大ごみ」",
    ])
    expect(rows).toHaveLength(3)
  })
  it("見出しが違えば止める", () => {
    expect(() => toStandardCsv(HEAD.replace("classification", "kubun"))).toThrow(
      /見出し/
    )
  })
  it("品目名があるのに区分が空なら止める", () => {
    expect(() => toStandardCsv(HEAD + '"2","アイロン","",""\r\n')).toThrow(
      /空です/
    )
  })
})

describe("高松市のアダプタ(取得済みの CSV で)", () => {
  const items = takamatsuCityAdapter.parse(
    readFileSync(join(CACHE_DIR, "takamatsu-city.csv"), "utf-8")
  )
  const find = (name: string) => items.find((i) => i.name_ja === name)

  it("606品目を読み、区分はすべて区分IDに当たる", () => {
    expect(items).toHaveLength(606)
    for (const item of items)
      for (const row of item.rows)
        expect(
          takamatsuCityAdapter.resolveCategoryId(row.category_label)
        ).not.toBeNull()
  })

  it("「破砕、臨時・粗大」はカードを分け、1枚目に原文の表記を残す", () => {
    const rows = find("ござ（プラスチック製）")?.rows ?? []
    expect(rows.map((r) => r.category_label)).toEqual(["破砕", "臨時・粗大"])
    expect(rows[0].note).toContain("出し方: 破砕、臨時・粗大。")
  })

  it("収集不可は「市では収集しません。」で始まる", () => {
    for (const name of ["ガスボンベ", "消火器", "農薬"])
      expect(find(name)?.rows[0].note?.startsWith("市では収集しません。")).toBe(
        true
      )
  })

  it("モバイルバッテリー(データでは注意点が空)に回収ボックスの案内を添える", () => {
    const note = find("モバイルバッテリー")?.rows[0].note ?? ""
    expect(note).toContain("市の小型充電式電池の回収ボックス")
    expect(note).toContain("市では収集しません。")
  })

  it("破砕ごみの品目には、電池を内蔵した充電式の製品を入れない注意が付く", () => {
    for (const name of ["アイロン", "電気ストーブ", "カメラ"])
      expect(find(name)?.rows[0].note).toContain(
        "絶対に破砕ごみに入れないでください"
      )
  })

  it("網戸・薬びんは冊子との違いを注記で示し、市の注意点は残す", () => {
    const amido = find("網戸")?.rows[0].note ?? ""
    expect(amido.startsWith("※もったいナビ注: ")).toBe(true)
    expect(amido).toContain("請負工事で発生したものは収集不可")
    expect(find("薬びん（自己使用に限る）")?.rows[0].note).toContain(
      "缶・びん・ペットボトル"
    )
  })
})
