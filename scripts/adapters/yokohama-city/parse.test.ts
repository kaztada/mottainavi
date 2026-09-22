import { describe, expect, it } from "vitest"
import categories from "../../../data/municipalities/yokohama-city/categories.json"
import {
  CATEGORY_NAME,
  LABEL_TO_ID,
  OFFICIAL_LINK,
  resolveCategoryId,
} from "./category-map"
import { buildNote, htmlToText, parseYokohamaCsv, readRows } from "./parse"

const HEADER = "ID,頭文字,品目名,小型家電回収対象,出し方,出し方のポイント\n"

describe("htmlToText", () => {
  it("リンクは本文(URL)に、<br>は改行に、文言はそのまま", () => {
    expect(
      htmlToText(
        '詳しくは<a href="https://example.com/a.html">市ホームページ</a>へ。<br>金属製は小さな金属類へ'
      )
    ).toBe(
      "詳しくは市ホームページ(https://example.com/a.html)へ。\n金属製は小さな金属類へ"
    )
  })
  it("HTML が無ければそのまま", () => {
    expect(htmlToText("尖った部分は新聞紙等で包む")).toBe(
      "尖った部分は新聞紙等で包む"
    )
  })
})

describe("resolveCategoryId / buildNote", () => {
  it("全角括弧の古紙4種は koshi に寄せ、種別をポイント先頭に残す", () => {
    expect(resolveCategoryId("古紙（段ボール）")).toBe("koshi")
    expect(buildNote("古紙（段ボール）", "koshi", "")).toBe(
      "出し方: 古紙（段ボール）。"
    )
  })
  it("個別指示は kobetsu に寄せ、市の表記を残す", () => {
    expect(resolveCategoryId("最寄りの警察署に相談")).toBe("kobetsu")
    expect(buildNote("最寄りの警察署に相談", "kobetsu", "")).toBe(
      "出し方: 最寄りの警察署に相談。"
    )
  })
  it("ラベルが区分名と同じなら表記を足さない", () => {
    expect(buildNote("燃やすごみ", "moyasu", "50cm以上は粗大ごみへ")).toBe(
      "50cm以上は粗大ごみへ"
    )
    expect(buildNote("燃やすごみ", "moyasu", "")).toBeNull()
  })
  it("家電リサイクルは市では収集しない旨を必ず添える(注意文言の欠落を防ぐ)", () => {
    expect(buildNote("家電リサイクル", "kaden-recycle", "")).toMatch(
      /市では収集しません/
    )
  })
  it("未知ラベルは null", () => {
    expect(resolveCategoryId("謎の出し方")).toBeNull()
  })
})

describe("parseYokohamaCsv", () => {
  it("◎の品目は回収ボックスの区分行を合成する", () => {
    const items = parseYokohamaCsv(
      HEADER + "2,あ,アイロン(プラスチック製),◎,燃やすごみ,\n"
    )
    expect(items).toHaveLength(1)
    expect(items[0].rows.map((r) => r.category_label)).toEqual([
      "燃やすごみ",
      "小型家電回収ボックス",
    ])
    expect(items[0].rows[0].official_link).toBe(OFFICIAL_LINK.moyasu)
  })
  it("引用符内の改行を含むポイントを1品目として読む", () => {
    const text =
      HEADER +
      '10,あ,足拭きマット,,燃やすごみ,"珪藻土製品は燃えないごみ。\n詳しくは<a href=""https://x.example/a.html"">市ホームページ</a>へ。"\n11,あ,アンテナ,,粗大ごみ,\n'
    const items = parseYokohamaCsv(text)
    expect(items.map((i) => i.name_ja)).toEqual(["足拭きマット", "アンテナ"])
    expect(items[0].rows[0].note).toBe(
      "珪藻土製品は燃えないごみ。\n詳しくは市ホームページ(https://x.example/a.html)へ。"
    )
  })
  it("列構成が違えばエラー(市がCSVの形式を変えたときに気づく)", () => {
    expect(() => readRows("ID,品目名,出し方\n1,a,b\n")).toThrow()
  })
})

describe("category-map と categories.json の整合", () => {
  it("マップ先の区分IDと公式リンクの区分IDがすべて categories.json に存在する", () => {
    const ids = new Set(categories.map((c) => c.id))
    for (const id of Object.values(LABEL_TO_ID)) expect(ids.has(id)).toBe(true)
    for (const id of Object.keys(OFFICIAL_LINK)) expect(ids.has(id)).toBe(true)
    for (const id of Object.keys(CATEGORY_NAME)) expect(ids.has(id)).toBe(true)
  })
  it("categories.json の全区分に公式リンクと表示名がある", () => {
    for (const c of categories) {
      expect(OFFICIAL_LINK[c.id]).toBeTruthy()
      expect(CATEGORY_NAME[c.id]).toBe(c.name_ja)
    }
  })
})
