import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR, municipalityFile } from "../../core/paths"
import { checkConfig } from "../../core/standard-csv"
import {
  EXPECTED_HEADER,
  FIXED_NAME,
  KENKO_CONTINUATION,
  WRONG_NAME,
  fixLabel,
  fixNote,
  toStandardCsv,
} from "./convert"
import { tottoriCityAdapter, tottoriCityConfig } from "./index"

const HEAD = "﻿" + EXPECTED_HEADER.join(",") + "\r\n"
/** 料金・連絡先・備考の列(鳥取市の CSV の書き方) */
const TAIL = ",,,,環境局生活環境課,0857-30-8084,,,,,"
const row = (name: string, label: string, note: string) =>
  `312011,,${name},${label},${note}${TAIL}\r\n`

describe("toStandardCsv(鳥取市の英語の見出し → 標準形式)", () => {
  it("見出しを標準形式に直し、品目・区分・注意点を残す", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD + row("アイスピック", "小型破砕", "透明又は半透明の袋に入れて出してください。")
      )
    )
    expect(rows[0]).toEqual(["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"])
    expect(rows[1]).toEqual([
      "312011",
      "",
      "アイスピック",
      "小型破砕",
      "透明又は半透明の袋に入れて出してください。",
    ])
  })

  it("区分の表記ゆれと、空白だけの注意点を直す", () => {
    expect(fixLabel("可　燃")).toBe("可燃")
    expect(fixLabel("小型破砕ごみ")).toBe("小型破砕")
    expect(fixNote("　")).toBe("")
    expect(fixNote(" ")).toBe("")
    const rows = parseCsv(toStandardCsv(HEAD + row("網（ネット）", "可　燃", "　")))
    expect(rows[1].slice(2)).toEqual(["網（ネット）", "可燃", ""])
  })

  it("健康器具の注意書きの2行目(区分が空の行)を、健康器具の注意書きにつなぐ", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          row("健康器具", "大型", "50cm未満のものは小型破砕ごみです。") +
          row(KENKO_CONTINUATION, "", "") +
          row("剣山（けんざん）", "小型破砕", "")
      )
    )
    expect(rows).toHaveLength(3)
    expect(rows[1][2]).toBe("健康器具")
    expect(rows[1][4]).toBe(`50cm未満のものは小型破砕ごみです。${KENKO_CONTINUATION}`)
    expect(rows[2][2]).toBe("剣山（けんざん）")
  })

  it("ほかに区分が空の行・品目名の欄に文が入った行があれば止める", () => {
    expect(() =>
      toStandardCsv(HEAD + row("なべ", "小型破砕", "") + row("外して出してください。", "", ""))
    ).toThrow(/区分が空/)
    expect(() => toStandardCsv(HEAD + row(KENKO_CONTINUATION, "", ""))).toThrow(/区分が空/)
    expect(() =>
      toStandardCsv(HEAD + row("電池は外して出してください。", "小型破砕", ""))
    ).toThrow(/品目名の欄に文/)
  })

  it("テーブルクロス(木製)を布製に直す。区分が違えば止める", () => {
    const rows = parseCsv(toStandardCsv(HEAD + row(WRONG_NAME, "可燃", " ")))
    expect(rows[1][2]).toBe(FIXED_NAME)
    expect(() => toStandardCsv(HEAD + row(WRONG_NAME, "大型", ""))).toThrow(/区分が想定/)
  })

  it("見出し・列数が違う、料金・備考の列に値があれば止める", () => {
    expect(() => toStandardCsv("itemName,sortingType\r\n")).toThrow(/見出し/)
    expect(() => toStandardCsv(HEAD + "312011,,なべ,小型破砕\r\n")).toThrow(/列数/)
    expect(() =>
      toStandardCsv(
        HEAD + "312011,,ソファー,大型,,有料,2000,,環境局生活環境課,0857-30-8084,,,,,\r\n"
      )
    ).toThrow(/料金・備考の列/)
  })
})

describe("鳥取市のアダプタ(取得済みの CSV で)", () => {
  const items = tottoriCityAdapter.parse(
    readFileSync(join(CACHE_DIR, "tottori-city.csv"), "utf-8")
  )
  const find = (name: string) => items.find((i) => i.name_ja === name)

  it("設定と categories.json が合っている", () => {
    const categories = JSON.parse(
      readFileSync(municipalityFile("tottori-city", "categories.json"), "utf-8")
    )
    expect(checkConfig(tottoriCityConfig, categories)).toEqual([])
  })

  it("839品目を読み、すべての区分の表記が区分に当たる", () => {
    expect(items).toHaveLength(839)
    for (const item of items) {
      for (const r of item.rows) {
        expect(tottoriCityAdapter.resolveCategoryId(r.category_label)).not.toBeNull()
      }
    }
  })

  it("書き損じを直している", () => {
    expect(find("健康器具")?.rows[0].note).toContain(KENKO_CONTINUATION)
    expect(find(KENKO_CONTINUATION)).toBeUndefined()
    expect(find(FIXED_NAME)).toBeDefined()
    expect(find(WRONG_NAME)).toBeUndefined()
  })

  it("持出禁止の品目は「市では収集しません。」で始まる", () => {
    expect(find("消火器")?.rows[0].note?.startsWith("市では収集しません。")).toBe(true)
  })
})
