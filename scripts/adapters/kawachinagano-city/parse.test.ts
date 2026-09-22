import { describe, expect, it } from "vitest"
import categories from "../../../data/municipalities/kawachinagano-city/categories.json"
import {
  CATEGORY_NAME,
  LABEL_TO_ID,
  OFFICIAL_LINK,
  resolveCategoryId,
} from "./category-map"
import { cutItems, joinNote, parseKawachinaganoText } from "./parse"

const HEAD =
  "表紙\nR8年作成\n☆家庭用ごみの分別辞典☆\n品名 分別の種類 備考（注意事項）\n"

describe("cutItems", () => {
  it("50音見出しを外し、品名・区分・備考に分ける", () => {
    const items = cutItems([
      "あ アイロン もえないごみ・粗大ごみ",
      "い 石 回収できません 建材店等で引き取ってもらう。",
    ])
    expect(items).toEqual([
      { name: "アイロン", label: "もえないごみ・粗大ごみ", noteLines: [] },
      {
        name: "石",
        label: "回収できません",
        noteLines: ["建材店等で引き取ってもらう。"],
      },
    ])
  })
  it("折り返した品名を次の行とつなぐ", () => {
    const items = cutItems([
      "油（機械用） 回収できません 取扱店等で引き取ってもらう。",
      "油よけ（コンロの周りに使用するアルミホイ",
      "ル状のもの） もえるごみ",
    ])
    expect(items[1]).toEqual({
      name: "油よけ（コンロの周りに使用するアルミホイル状のもの）",
      label: "もえるごみ",
      noteLines: [],
    })
  })
  it("折り返した区分名をつなぐ", () => {
    const items = cutItems([
      "インスタントラーメンの外袋（ビニール製） 資源ごみ（プラスチック製容器包",
      "装）",
      "衣類乾燥機 通常の収集（集積所からの収集）",
      "では回収できません",
      "家電リサイクル法でリサイクル対象となっているた",
      "め、家電小売店等で引き取ってもらう。",
    ])
    expect(items.map((i) => i.label)).toEqual([
      "資源ごみ（プラスチック製容器包装）",
      "通常の収集（集積所からの収集）では回収できません",
    ])
    expect(joinNote(items[1].noteLines)).toBe(
      "家電リサイクル法でリサイクル対象となっているため、家電小売店等で引き取ってもらう。"
    )
  })
  it("備考の中の「…もえるごみで出す」を品目行と誤認しない", () => {
    const items = cutItems([
      "板切れ（増改築に伴うものを除く） もえないごみ・粗大ごみ 長さは1.5ｍ以内にする。推奨袋に入る小さなもの",
      "は、もえるごみで出す。",
      "一輪車（スポーツ用） もえないごみ・粗大ごみ",
    ])
    expect(items).toHaveLength(2)
    expect(joinNote(items[0].noteLines)).toBe(
      "長さは1.5ｍ以内にする。推奨袋に入る小さなものは、もえるごみで出す。"
    )
  })
  it("区分のない行が続く複数文の備考は改行でつなぐ", () => {
    const items = cutItems([
      "アンプ（オーディオ機器） もえないごみ・粗大ごみ",
      "バッテリー内蔵のものはバッテリーを外して出す。",
      "バッテリーを外せない場合は、メーカー・販売店もし",
      "くは市役所にお問い合わせください。",
      "い 石臼 回収できません 建材店等で引き取ってもらう。",
    ])
    expect(items).toHaveLength(2)
    expect(joinNote(items[0].noteLines)).toBe(
      "バッテリー内蔵のものはバッテリーを外して出す。\nバッテリーを外せない場合は、メーカー・販売店もしくは市役所にお問い合わせください。"
    )
  })
})

describe("parseKawachinaganoText", () => {
  it("表紙・ページ見出し・ページ番号を捨て、もえないごみ・粗大ごみに申込み不要の説明を入れる", () => {
    const text =
      HEAD +
      "あ アイロン もえないごみ・粗大ごみ\n1\n☆家庭用ごみの分別辞典☆\n品名 分別の種類 備考（注意事項）\nアルバム もえるごみ\n"
    const items = parseKawachinaganoText(text)
    expect(items.map((i) => i.name_ja)).toEqual(["アイロン", "アルバム"])
    expect(items[0].rows[0].note).toMatch(/申込みは不要/)
    expect(items[1].rows[0].note).toBeNull()
  })
  it("回収できませんで備考が空なら「市では回収できません。」を入れる", () => {
    const [item] = parseKawachinaganoText(HEAD + "大理石の机 回収できません\n")
    expect(item.rows[0].note).toBe("市では回収できません。")
  })
  it("見出しが無ければエラー(PDFの形式変更に気づく)", () => {
    expect(() => parseKawachinaganoText("別の文書\n")).toThrow()
  })
})

describe("category-map と categories.json の整合", () => {
  it("表記ゆれを吸収し、マップ先・公式リンク・表示名が categories.json と一致する", () => {
    expect(resolveCategoryId("もえないごみ.粗大ごみ")).toBe("moenai-sodai")
    expect(resolveCategoryId("資源ごみ（小型金属類）")).toBe("kinzoku")
    const byId = new Map(categories.map((c) => [c.id, c]))
    for (const id of Object.values(LABEL_TO_ID)) expect(byId.has(id)).toBe(true)
    for (const c of categories) {
      expect(OFFICIAL_LINK[c.id]).toBeTruthy()
      expect(CATEGORY_NAME[c.id]).toBe(c.name_ja)
    }
  })
  it("もえないごみ・粗大ごみは申込制(bulky)にしない", () => {
    expect(categories.find((c) => c.id === "moenai-sodai")?.kind).toBe(
      "non-burnable"
    )
  })
})
