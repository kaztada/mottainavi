import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { normalizeLabel } from "../../core/standard-csv"
import { EXPECTED_HEADER, splitName, toStandardCsv } from "./convert"
import { nakanoKuAdapter, nakanoKuConfig } from "./index"

const HEAD = "﻿" + EXPECTED_HEADER.map((h) => `"${h}"`).join(",") + "\r\n"
const GIS = '"中野区中野4-11-19","139.662926236846","35.7088740640065"'

describe("splitName(中野区の品目名)", () => {
  it("「改行+※別名」を外す", () => {
    expect(splitName("ソファー\n※いす")).toEqual({
      name: "ソファー",
      alias: "いす",
    })
    expect(splitName("アイロン")).toEqual({ name: "アイロン", alias: null })
  })
  it("改行の後ろが「※」で始まらなければ止める", () => {
    expect(() => splitName("ソファー\nいす")).toThrow(/※別名/)
  })
  it("品目名の書き損じを直す", () => {
    expect(splitName("パイプべッド").name).toBe("パイプベッド")
    expect(splitName("びん（医薬品・化粧品等、飲食用以外のもの").name).toBe(
      "びん（医薬品・化粧品等、飲食用以外のもの）"
    )
  })
})

describe("toStandardCsv(中野区の CSV)", () => {
  it("品目・種別・説明を標準形式にし、GIS と分類の列は使わない", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          `"ソファー\n※いす","そふぁー","粗大ごみ","",${GIS},"ごみ分別一覧"\r\n` +
          `"アイスピック","あいすぴっく","陶器・ガラス・金属ごみ","紙などで包み\r\n別の袋に",${GIS},"ごみ分別一覧"\r\n`
      )
    )
    expect(rows[0]).toEqual([
      "全国地方公共団体コード",
      "ID",
      "品目",
      "分別区分",
      "注意点",
    ])
    expect(rows[1]).toEqual(["131148", "1", "ソファー", "粗大ごみ", ""])
    expect(rows[2]).toEqual([
      "131148",
      "2",
      "アイスピック",
      "陶器・ガラス・金属ごみ",
      "紙などで包み\n別の袋に",
    ])
  })
  it("分類が「ごみ分別一覧」でなければ止める", () => {
    expect(() =>
      toStandardCsv(
        HEAD +
          `"アイロン","あいろん","陶器・ガラス・金属ごみ","",${GIS},"収集日"\r\n`
      )
    ).toThrow(/分類/)
  })
  it("見出しが変わったら止める", () => {
    expect(() => toStandardCsv(HEAD.replace("種別", "区分"))).toThrow(/見出し/)
  })
  it("区の種別の表記はすべて正規化済み", () => {
    for (const label of Object.keys(nakanoKuConfig.labelToId))
      expect(label).toBe(normalizeLabel(label))
  })
})

describe("中野区のアダプタ(取得済みの CSV で)", () => {
  const items = nakanoKuAdapter.parse(
    readFileSync(join(CACHE_DIR, "nakano-ku.csv"), "utf-8")
  )
  const find = (name: string) => items.find((i) => i.name_ja === name)

  it("942品目を読み、品目名に改行・※別名が残らない", () => {
    expect(items).toHaveLength(942)
    for (const item of items) expect(item.name_ja).not.toMatch(/\n|※/)
    expect(find("ソファー")?.rows[0].category_label).toBe("粗大ごみ")
  })

  it("収集しない区分は「区では収集しません。」にする", () => {
    expect(
      find("消火器")?.rows[0].note?.startsWith("区では収集しません。")
    ).toBe(true)
    expect(
      items.some((i) =>
        i.rows.some((r) => r.note?.includes("市では収集しません"))
      )
    ).toBe(false)
  })

  it("乾電池は今の案内(ボタン電池は回収ボックス、充電式電池は集積所)を先に示す", () => {
    const note =
      find("乾電池（アルカリ・マンガン・リチウム一次電池）")?.rows[0].note ?? ""
    expect(note.startsWith("※もったいナビ注: 区の現行の案内")).toBe(true)
    expect(note).toContain("約45か所の乾電池回収ボックス")
  })
})
