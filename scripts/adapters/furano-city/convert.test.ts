import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { normalizeName, toStandardCsv } from "./convert"
import { furanoCityAdapter } from "./index"

const HEAD = "50音順,品　　　　　名,分別の区分,出し方のアドバイス,,\n"

describe("富良野市の変換", () => {
  it("品目名の前後の空白・改行を取り、注意文は変えない", () => {
    const out = parseCsv(
      toStandardCsv(`﻿${HEAD}け,"血糖測定用穿刺針　　",在宅医療ごみ,"処方を受けた　医療機関\n",,\n`)
    )
    expect(out[1].slice(2)).toEqual([
      "血糖測定用穿刺針",
      "在宅医療ごみ",
      "処方を受けた　医療機関\n",
    ])
  })
  it("2つの名前が入ったセルの改行は「/」、ほかの改行は止める", () => {
    expect(normalizeName("ブルーシート\r\nレジャーシート")).toBe(
      "ブルーシート/レジャーシート"
    )
    expect(() => normalizeName("ほうき\nちりとり")).toThrow()
  })
  it("見出しが違う・空の列に値がある・区分が空なら止める", () => {
    expect(() => toStandardCsv("品名,区分\nあ,い\n")).toThrow()
    expect(() => toStandardCsv(`${HEAD}あ,傘,大型ごみ,,x,\n`)).toThrow()
    expect(() => toStandardCsv(`${HEAD}あ,傘,,,,\n`)).toThrow()
  })
  it("原本: 読みの重複(漏斗)は1品目、灯油タンク(金属製)は2枚のカードで注記つき", () => {
    const items = furanoCityAdapter.parse(
      readFileSync(join(CACHE_DIR, "furano-city.csv"), "utf-8")
    )
    expect(items).toHaveLength(1637)
    const by = (n: string) => items.filter((i) => i.name_ja === n)
    expect(by("漏斗（金属製）")).toHaveLength(1)
    expect(by("漏斗（金属製）")[0].rows).toHaveLength(1)
    const tank = by("灯油タンク（金属製）")[0].rows
    expect(tank.map((r) => r.category_label)).toEqual(["金属類", "大型ごみ"])
    for (const r of tank) expect(r.note).toContain("※もったいナビ注")
  })
  it("原本: 家電リサイクル品に収集しない文と法律の文言が出る", () => {
    const items = furanoCityAdapter.parse(
      readFileSync(join(CACHE_DIR, "furano-city.csv"), "utf-8")
    )
    const note = items.find((i) => i.name_ja === "冷蔵庫")!.rows[0].note!
    expect(note).toContain("市では収集しません。")
    expect(note).toContain("家電リサイクル法に基づき処理")
  })
})
