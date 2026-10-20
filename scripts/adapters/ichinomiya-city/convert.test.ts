import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { normalizeLabel, normalizeNote, toStandardCsv } from "./convert"
import { ichinomiyaCityAdapter } from "./index"

const EMPTY14 = ",".repeat(14)
const HEAD = `分別帳一覧,,,${EMPTY14}\r\n,,,${EMPTY14}\r\nごみ名,索引,分別区分,分別注意文${EMPTY14}\r\n,,,${EMPTY14}\r\n`

describe("normalizeLabel(一宮市の区分名)", () => {
  it("アプリの画面の文言を外す", () => {
    expect(normalizeLabel("家電4品目（詳しくはここをタップ）")).toBe(
      "家電4品目"
    )
    expect(normalizeLabel("家電4品目（詳細はここをタップ）")).toBe("家電4品目")
  })
  it("「、もしくは」の読点を外す", () => {
    expect(
      normalizeLabel(
        "リチウムイオン電池を使用した小型家電など、もしくは不燃ごみ"
      )
    ).toBe("リチウムイオン電池を使用した小型家電などもしくは不燃ごみ")
  })
})

describe("normalizeNote(一宮市の注意文)", () => {
  it("改行コードをそろえるだけで、文字(「詳しくはこちら」・書き損じ)は変えない", () => {
    expect(
      normalizeNote(
        "可燃ごみと同じ収集日です。\r\n（詳しくはこちら）\r\nhttps://example.jp/a.html"
      )
    ).toBe(
      "可燃ごみと同じ収集日です。\n（詳しくはこちら）\nhttps://example.jp/a.html"
    )
    expect(
      normalizeNote(
        "指定ごみ袋に入らない一辺が６０ｃｍのもの、６ｋｇ以上のものは粗大ごみ"
      )
    ).toBe(
      "指定ごみ袋に入らない一辺が６０ｃｍのもの、６ｋｇ以上のものは粗大ごみ"
    )
  })
})

describe("toStandardCsv(一宮市の CSV)", () => {
  it("表題・空行・空の列を除き、連番の ID を振る", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          `アイロン,あ,不燃ごみ,${EMPTY14}\r\n` +
          `,,,${EMPTY14}\r\n` +
          `モバイルバッテリー,も,リチウムイオン電池を使用した小型家電など、もしくは小型家電,膨張したものは除く${EMPTY14}\r\n`
      )
    )
    expect(rows[0]).toEqual([
      "全国地方公共団体コード",
      "ID",
      "品目",
      "分別区分",
      "注意点",
    ])
    expect(rows[1]).toEqual(["232033", "1", "アイロン", "不燃ごみ", ""])
    expect(rows[2]).toEqual([
      "232033",
      "2",
      "モバイルバッテリー",
      "リチウムイオン電池を使用した小型家電などもしくは小型家電",
      "膨張したものは除く",
    ])
  })
  it("表題が違えば止める", () => {
    expect(() => toStandardCsv(HEAD.replace("分別帳一覧", "一覧"))).toThrow(
      /表題/
    )
  })
  it("空のはずの列に値があれば止める", () => {
    expect(() =>
      toStandardCsv(HEAD + `アイロン,あ,不燃ごみ,,800円${",".repeat(13)}\r\n`)
    ).toThrow(/5列目より後ろ/)
  })
})

describe("一宮市のアダプタ(取得済みの CSV で)", () => {
  const items = ichinomiyaCityAdapter.parse(
    readFileSync(join(CACHE_DIR, "ichinomiya-city.csv"), "utf-8")
  )
  const find = (name: string) => items.find((i) => i.name_ja === name)

  it("689品目を読み、区分はすべて区分IDに当たる", () => {
    expect(items).toHaveLength(689)
    for (const item of items)
      for (const row of item.rows)
        expect(
          ichinomiyaCityAdapter.resolveCategoryId(row.category_label)
        ).not.toBeNull()
  })

  it("「もしくは」の2区分はカードを分ける", () => {
    expect(
      find("モバイルバッテリー")?.rows.map((r) => r.category_label)
    ).toEqual(["リチウムイオン電池を使用した小型家電など", "小型家電"])
    expect(find("アルカリ電池")?.rows.map((r) => r.category_label)).toEqual([
      "町内回収資源",
      "拠点回収",
    ])
  })

  it("バッテリーは車・バイク用を先に書く", () => {
    const note = find("バッテリー")?.rows[0].note ?? ""
    expect(
      note.startsWith(
        "※もったいナビ注: 自動車・バイク用のバッテリー(鉛蓄電池)は市では収集しません。"
      )
    ).toBe(true)
  })

  it("収集しない区分は「市では収集しません。」で始まる", () => {
    for (const name of ["消火器", "テレビ", "パソコン"])
      expect(find(name)?.rows[0].note?.startsWith("市では収集しません。")).toBe(
        true
      )
  })

  it("区分名に画面の文言「タップ」は残らない", () => {
    for (const item of items)
      for (const row of item.rows)
        expect(row.category_label).not.toMatch(/タップ/)
  })

  it("「一辺が６０ｃｍのもの」の品目は原文を残し、注記で補う", () => {
    const note = find("アイロン台")?.rows[0].note ?? ""
    expect(note.startsWith("※もったいナビ注: 一辺が60cm以上のもの")).toBe(true)
    expect(note).toContain("一辺が６０ｃｍのもの、６ｋｇ以上のものは粗大ごみ")
  })
})
