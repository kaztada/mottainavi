import { describe, expect, it } from "vitest"
import categories from "../../../data/municipalities/hirakata-city/categories.json"
import {
  CATEGORY_NAME,
  LABEL_TO_ID,
  OFFICIAL_LINK,
  feeFromLabel,
  resolveCategoryId,
} from "./category-map"
import { cellText } from "./excel"
import { buildNote, rowsToRawItems, splitName } from "./parse"

describe("resolveCategoryId / feeFromLabel", () => {
  it("金額付きの大型ごみは ogata、金額を取り出す", () => {
    expect(resolveCategoryId("大型ごみ600円")).toBe("ogata")
    expect(feeFromLabel("大型ごみ600円")).toBe(600)
    expect(resolveCategoryId("粗ごみ・大型ごみ300円")).toBe("aragomi-ogata")
    expect(feeFromLabel("粗ごみ")).toBeNull()
  })
  it("全角英字・読点の表記ゆれを吸収", () => {
    expect(resolveCategoryId("ＰＣリサイクル品目")).toBe("pc")
    expect(resolveCategoryId("空き缶、びん・ガラス類")).toBe("kan-bin")
    expect(resolveCategoryId("臨時ごみ・持ち込み　動物")).toBe("kobetsu")
  })
})

describe("buildNote", () => {
  it("指定品目は処理手数料を先頭に置く(共通パイプラインの手数料抽出が拾う形)", () => {
    expect(buildNote("大型ごみ600円", "ogata", "指定品目")).toBe(
      "処理手数料 600円(指定品目)。\n指定品目"
    )
  })
  it("サイズ判断品目には市の定義を先頭に置く", () => {
    expect(
      buildNote("粗ごみ・大型ごみ", "aragomi-ogata", "サイズ判断品目")
    ).toMatch(/^サイズ判断品目: 幅・奥行き・高さが1メートル未満は粗ごみ/)
  })
  it("家電リサイクル品目は注意点が無くても市で収集しない旨が入る", () => {
    expect(buildNote("家電リサイクル品目", "kaden", "")).toMatch(
      /市では収集しません/
    )
  })
  it("臨時ごみの表記は市の表記を残す", () => {
    expect(buildNote("臨時ごみ・持ち込み　動物", "kobetsu", null)).toBe(
      "出し方: 臨時ごみ・持ち込み　動物。"
    )
  })
})

describe("組み合わせ表記と説明の重複", () => {
  it("「一般ごみ・粗ごみ」はカードを2枚に分け、市の表記を1枚目に残す", () => {
    const [item] = rowsToRawItems([
      {
        name: "草花",
        note: "45㍑袋に収まる場合は一般ごみ",
        label: "一般ごみ・粗ごみ",
      },
    ])
    expect(item.rows.map((r) => r.category_label)).toEqual([
      "一般ごみ",
      "粗ごみ",
    ])
    expect(item.rows[0].note).toBe(
      "出し方: 一般ごみ・粗ごみ(条件によって分かれます)。\n45㍑袋に収まる場合は一般ごみ"
    )
    expect(item.rows[1].note).toBeNull()
  })
  it("処理困難物の説明は、市の注意点に同じ内容があれば重ねない", () => {
    expect(
      buildNote(
        "処理困難物",
        "konnan",
        "販売店・製造元に相談。または、ごみ処理（一般廃棄物）業者に依頼"
      )
    ).toBe("販売店・製造元に相談。または、ごみ処理（一般廃棄物）業者に依頼")
    expect(buildNote("処理困難物", "konnan", "")).toBe(
      "販売店・製造元に相談。または、ごみ処理(一般廃棄物)業者に依頼。"
    )
  })
})

describe("splitName", () => {
  it("改行を1行にまとめる", () => {
    expect(splitName("網戸\n（アルミ枠、スチール枠、木枠）")).toEqual({
      name: "網戸（アルミ枠、スチール枠、木枠）",
      extraNote: null,
    })
  })
  it("手続きの説明の行は注意文言へ回す", () => {
    expect(
      splitName(
        "動物の死骸（のら・ペット）\n粗大ごみ予約センターに申し込みが必要"
      )
    ).toEqual({
      name: "動物の死骸（のら・ペット）",
      extraNote: "粗大ごみ予約センターに申し込みが必要",
    })
  })
})

describe("rowsToRawItems", () => {
  it("改行で複数区分が入ったセルはカードを分け、注意文言は1枚目に付ける", () => {
    const [item] = rowsToRawItems([
      {
        name: "冷温庫",
        note: "＊家電リサイクル券センターに相談",
        label: "家電リサイクル品目\n粗ごみ・大型ごみ\n処理困難物",
      },
    ])
    expect(item.rows.map((r) => r.category_label)).toEqual([
      "家電リサイクル品目",
      "粗ごみ・大型ごみ",
      "処理困難物",
    ])
    expect(item.rows[0].note).toMatch(/家電リサイクル券センターに相談/)
    expect(item.rows[1].note).not.toMatch(/家電リサイクル券センター/)
    expect(item.rows[2].note).toMatch(/販売店・製造元に相談/)
  })
  it("同名の行は1品目にまとめ、条件ごとのカードにする", () => {
    const items = rowsToRawItems([
      {
        name: "ワックス缶",
        note: "中身を除く",
        label: "空き缶・びん・ガラス類",
      },
      { name: "ワックス缶", note: "中身が残っている場合", label: "粗ごみ" },
    ])
    expect(items).toHaveLength(1)
    expect(items[0].rows.map((r) => r.note)).toEqual([
      "中身を除く",
      "中身が残っている場合",
    ])
    expect(items[0].rows[1].official_link).toBe(OFFICIAL_LINK.aragomi)
  })
})

describe("cellText", () => {
  it("リッチテキスト・数式の結果・空を文字列にする", () => {
    expect(
      cellText({ richText: [{ text: "処理困難物" }, { text: "・大型ごみ" }] })
    ).toBe("処理困難物・大型ごみ")
    expect(cellText({ formula: "PHONETIC(B3)", result: "アイスマクラ" })).toBe(
      "アイスマクラ"
    )
    expect(cellText(null)).toBe("")
  })
})

describe("category-map と categories.json の整合", () => {
  it("マップ先・公式リンク・表示名がすべて categories.json と一致する", () => {
    const byId = new Map(categories.map((c) => [c.id, c]))
    for (const id of Object.values(LABEL_TO_ID)) expect(byId.has(id)).toBe(true)
    for (const c of categories) {
      expect(OFFICIAL_LINK[c.id]).toBeTruthy()
      expect(CATEGORY_NAME[c.id]).toBe(c.name_ja)
    }
  })
})
