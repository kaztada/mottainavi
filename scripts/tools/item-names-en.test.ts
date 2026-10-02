import { describe, expect, it } from "vitest"
import {
  baseName,
  boilerplateSentences,
  englishProblem,
  parseWorkTsv,
  renderReview,
  shortNote,
  similarTranslations,
} from "./item-names-en"

describe("englishProblem", () => {
  it("決まりどおりの訳は問題なし", () => {
    expect(englishProblem("Iron (clothes iron)")).toBeNull()
    expect(englishProblem("18 L can (itto-kan)")).toBeNull()
    expect(englishProblem("Cane / walking stick (metal)")).toBeNull()
  })
  it("空・空白・ASCII 以外・文頭・括弧の問題を見つける", () => {
    expect(englishProblem("")).toBe("英訳が空です")
    expect(englishProblem(" Chair")).toBe("前後に空白があります")
    expect(englishProblem("Gas  stove")).toBe("空白が続いています")
    expect(englishProblem("Attaché case")).toBe("ASCII 以外の文字があります")
    expect(englishProblem("椅子")).toBe("ASCII 以外の文字があります")
    expect(englishProblem("chair")).toBe("文頭が大文字か数字ではありません")
    expect(englishProblem("Chair (wood")).toBe("括弧の数が合いません")
  })
})

describe("parseWorkTsv", () => {
  it("ID・英訳・要確認の理由を読む。空行と # の行は飛ばす", () => {
    const { rows, problems } = parseWorkTsv(
      [
        "# ID\t英訳\t理由",
        "abc-0001\tChair",
        "",
        "abc-0002\tOil (cooking oil etc.)\t品目名は「油」だけ",
      ].join("\n")
    )
    expect(problems).toEqual([])
    expect(rows).toEqual([
      { id: "abc-0001", en: "Chair", reason: "" },
      {
        id: "abc-0002",
        en: "Oil (cooking oil etc.)",
        reason: "品目名は「油」だけ",
      },
    ])
  })
  it("重複した ID と、書き方の問題を知らせる", () => {
    const { problems } = parseWorkTsv(
      ["abc-0001\tChair", "abc-0001\tchair", "\tDesk"].join("\n")
    )
    expect(problems).toEqual([
      "2行目(abc-0001): ID が重複しています",
      "2行目(abc-0001): 文頭が大文字か数字ではありません",
      "3行目(): ID がありません",
    ])
  })
})

describe("similarTranslations", () => {
  const dict = {
    "植木鉢（陶器製）": "Flowerpot (ceramic)",
    "植木鉢(プラスチック)": "Flowerpot (plastic)",
    アイロン台: "Ironing board",
    椅子: "Chair",
  }
  it("括弧の前が同じ品目の訳を返す", () => {
    expect(baseName("植木鉢（陶器製）")).toBe("植木鉢")
    expect(similarTranslations("植木鉢(金属)", dict)).toEqual([
      "植木鉢（陶器製）=Flowerpot (ceramic)",
      "植木鉢(プラスチック)=Flowerpot (plastic)",
    ])
  })
  it("3文字以上で含む・含まれる品目も返す(同じ品目名そのものは除く)", () => {
    expect(similarTranslations("アイロン", dict)).toEqual([
      "アイロン台=Ironing board",
    ])
    expect(similarTranslations("椅子", dict)).toEqual([])
  })
})

describe("boilerplateSentences / shortNote", () => {
  const common = "事前申込制です。処理券が必要です。"
  const notes = [
    ...Array.from({ length: 15 }, () => common),
    `${common} 指定袋に入る場合は、もやせないごみ`,
    "中身は使い切る",
  ]
  const boilerplate = boilerplateSentences(notes)
  it("多くの品目に共通する文を定型文とみなす", () => {
    expect(boilerplate).toEqual(
      new Set(["事前申込制です。", "処理券が必要です。"])
    )
  })
  it("定型文を除いて、品目ごとの注意点だけ残す", () => {
    expect(shortNote(notes[15], boilerplate)).toBe(
      "指定袋に入る場合は、もやせないごみ"
    )
    expect(shortNote(common, boilerplate)).toBe("")
    expect(shortNote("あ".repeat(200), boilerplate, 10)).toBe(
      "あ".repeat(10) + "…"
    )
  })
})

describe("renderReview", () => {
  it("要確認の品目を表にする", () => {
    const md = renderReview(
      "沖縄市",
      [
        {
          id: "okn-0009",
          name: "油",
          category: "もやせるごみ",
          note: "",
          en: "Oil (cooking oil etc.)",
          reason: "品目名は「油」だけ",
        },
      ],
      692
    )
    expect(md).toContain("# 沖縄市 品目名の英訳 要確認の一覧")
    expect(md).toContain("今回足した英訳は 692 件です")
    expect(md).toContain(
      "| okn-0009 | 油 | もやせるごみ | (なし) | Oil (cooking oil etc.) | 品目名は「油」だけ |"
    )
  })
})
