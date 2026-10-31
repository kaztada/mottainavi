import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { HEADER, UMOU_ITEMS, UMOU_LABEL, toStandardCsv } from "./convert"

const SENTENCE = "下松市社会福祉協議会でUMOUプロジェクトとして羽毛製品を回収しています。"
const head = HEADER.join(",") + "\r\n"
const row = (name: string, label: string, note = "") =>
  `352071,x,${name},${label},${note},無料,,,\r\n`
const umou = UMOU_ITEMS.map((n) => row(n, SENTENCE)).join("")

describe("toStandardCsv(下松市の CSV)", () => {
  it("羽毛製品の2行は区分を読み替え、元の文を注意点に原文のまま移す", () => {
    const rows = parseCsv(toStandardCsv(head + umou))
    expect(rows[1][2]).toBe(UMOU_ITEMS[0])
    expect(rows[1][3]).toBe(UMOU_LABEL)
    expect(rows[1][4]).toBe(SENTENCE)
  })

  it("ほかの行は変えない", () => {
    const rows = parseCsv(
      toStandardCsv(head + row("スプレー缶", "金属類", "中身を使いきって、穴をあけること") + umou)
    )
    expect(rows[1].slice(2, 5)).toEqual([
      "スプレー缶",
      "金属類",
      "中身を使いきって、穴をあけること",
    ])
  })

  it("空の行を消さない(共通アダプタの readRows が落とす)", () => {
    const rows = parseCsv(toStandardCsv(head + row("", "") + umou))
    expect(rows.length).toBe(4)
  })

  it("見出しが違えば止める", () => {
    expect(() => toStandardCsv("品目,区分\r\n")).toThrow(/見出し/)
  })

  it("別の品目の区分の欄に回収の文があれば止める", () => {
    expect(() => toStandardCsv(head + row("毛布", SENTENCE) + umou)).toThrow(/想定していない品目/)
  })

  it("読み替えの品目が無ければ止める", () => {
    expect(() => toStandardCsv(head + row(UMOU_ITEMS[0], SENTENCE))).toThrow(/見つかりません/)
  })
})
