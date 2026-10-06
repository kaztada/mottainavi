import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import categories from "../../../data/municipalities/kawachinagano-city/categories.json"
import {
  CATEGORY_NAME,
  LABEL_TO_ID,
  OFFICIAL_LINK,
  resolveCategoryId,
} from "./category-map"
import { bodyLines, cutItems, joinNote, parseKawachinaganoText } from "./parse"

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

describe("cutItems: 備考の末尾と次の品目名を混ぜない", () => {
  it("URL だけの行は備考に残し、次の品目名に混ぜない", () => {
    const items = cutItems([
      "オートバイ、バイク 回収できません",
      "取扱店等で引き取ってもらう。",
      "引き取ってもらえない場合は、「二輪車リサイクル",
      "システム」で引取対象か確認する。",
      "https://www.jarc.or.jp/motorcycle",
      "オーブントースター もえないごみ・粗大ごみ",
    ])
    expect(items.map((i) => i.name)).toEqual([
      "オートバイ、バイク",
      "オーブントースター",
    ])
    expect(joinNote(items[0].noteLines)).toBe(
      "取扱店等で引き取ってもらう。\n引き取ってもらえない場合は、「二輪車リサイクルシステム」で引取対象か確認する。\nhttps://www.jarc.or.jp/motorcycle"
    )
  })
  it("かっこ書きの補足の行は備考に残し、次の品目名に混ぜない", () => {
    const items = cutItems([
      "ゲーム機 もえないごみ・粗大ごみ 資源選別作業所へ持ち込むこともできます。",
      "（平日の13時～15時のみ）",
      "ゲームソフト もえるごみ",
      "スロットマシン もえないごみ・粗大ごみ 家庭で使用したものに限る。",
      "（事業者が排出する場合は、産業廃棄物）",
      "せ 精米機 もえないごみ・粗大ごみ",
    ])
    expect(items.map((i) => i.name)).toEqual([
      "ゲーム機",
      "ゲームソフト",
      "スロットマシン",
      "精米機",
    ])
    expect(joinNote(items[0].noteLines)).toBe(
      "資源選別作業所へ持ち込むこともできます。\n（平日の13時～15時のみ）"
    )
    expect(joinNote(items[2].noteLines)).toBe(
      "家庭で使用したものに限る。\n（事業者が排出する場合は、産業廃棄物）"
    )
  })
  it("単独の行になった50音見出しを捨て、URL で終わる備考のあとの折り返した品名をつなぐ", () => {
    const lines = bodyLines(
      HEAD +
        [
          "原動機付自転車 回収できません",
          "取扱店等で引き取ってもらう。",
          "https://www.jarc.or.jp/motorcycle",
          "こ",
          "コイン電池（リチウム一時電池）・ボタン電",
          "池 もえないごみ・粗大ごみ",
          "酸化銀電池（型式記号SR）が対象です。",
        ].join("\n")
    )
    const items = cutItems(lines)
    expect(items.map((i) => i.name)).toEqual([
      "原動機付自転車",
      "コイン電池（リチウム一時電池）・ボタン電池",
    ])
    expect(joinNote(items[0].noteLines)).toBe(
      "取扱店等で引き取ってもらう。\nhttps://www.jarc.or.jp/motorcycle"
    )
    expect(items[1].noteLines).toEqual(["酸化銀電池（型式記号SR）が対象です。"])
  })
})

describe("cutItems: 区分名が独立した行にある品目", () => {
  it("折り返した品名(2行)+ 区分名だけの行を1品目にする", () => {
    const items = cutItems([
      "発泡スチロールトレイ 資源ごみ（プラスチック製容器包",
      "装） 洗って乾かす。",
      "発泡スチロール箱（商品購入時の容器とし",
      "て使用されていたもの）",
      "資源ごみ（プラスチック製容器包",
      "装）",
      "発泡スチロール箱（クーラーボックス等、その",
      "物自体が製品として販売されていたもの） もえるごみ 推奨袋に入らない大きなものは、もえないごみ・粗",
      "大ごみで出す。",
    ])
    expect(items.map((i) => [i.name, i.label])).toEqual([
      ["発泡スチロールトレイ", "資源ごみ（プラスチック製容器包装）"],
      [
        "発泡スチロール箱（商品購入時の容器として使用されていたもの）",
        "資源ごみ（プラスチック製容器包装）",
      ],
      [
        "発泡スチロール箱（クーラーボックス等、その物自体が製品として販売されていたもの）",
        "もえるごみ",
      ],
    ])
    expect(items[0].noteLines).toEqual(["洗って乾かす。"])
  })
  it("3行の品名 + 区分名と備考の行(小型充電式電池)を、前の品目の備考に入れない", () => {
    const items = cutItems([
      "バッテリー（車・バイク・電動自動車など） 回収できません 取扱店等で引き取ってもらう。",
      "バッテリー（小型充電式電池）",
      "リチウムイオン電池、ニッケル水素電池、",
      "ニカド電池",
      "回収できません 家電量販店等の協力店や、市役所などに設置して",
      "いるリサイクルボックスに出す。",
    ])
    expect(items).toHaveLength(2)
    expect(items[0].noteLines).toEqual(["取扱店等で引き取ってもらう。"])
    expect(items[1].name).toBe(
      "バッテリー（小型充電式電池）リチウムイオン電池、ニッケル水素電池、ニカド電池"
    )
    expect(items[1].label).toBe("回収できません")
    expect(joinNote(items[1].noteLines)).toBe(
      "家電量販店等の協力店や、市役所などに設置しているリサイクルボックスに出す。"
    )
  })
  it("備考のない品目の直後でも、品名 + 区分名だけの行を1品目にする", () => {
    const items = cutItems([
      "園芸用殺虫剤（固形） もえるごみ",
      "園芸用殺虫剤の容器（プラマークの表示あ",
      "り）",
      "資源ごみ（プラスチック製容器包",
      "装） 洗って乾かす。",
    ])
    expect(items[0].noteLines).toEqual([])
    expect(items[1]).toEqual({
      name: "園芸用殺虫剤の容器（プラマークの表示あり）",
      label: "資源ごみ（プラスチック製容器包装）",
      noteLines: ["洗って乾かす。"],
    })
  })
})

describe("cutItems: PDF 側の区分名の誤記・区分名一覧に無い区分", () => {
  it("「もえないごみ・粗大ごみ粗大ごみ」「回収できません。」「要相談」を区分名として読む", () => {
    const items = cutItems([
      "ダンボール 資源ごみ（古紙）",
      "ち チーズフォンデュ用鍋（陶器製） もえないごみ・粗大ごみ粗大ごみ 五徳も含め金属製のものは、「小型金属」として出",
      "す。",
      "のみ（大工道具） もえないごみ・粗大ごみ 新聞紙や紙などに包んで出す。",
      "は HDD（SSD） 回収できません。 外付け用HDDは「もえないごみ・粗大ごみ」で出せ",
      "ます。内蔵HDDは回収できません。",
      "臼（石） 回収できません 建材店等で引き取ってもらう。",
      "臼（木） 要相談 大きさ等により処理できない場合がありますので、",
      "事前にご相談ください",
      "うちわ もえるごみ",
    ])
    expect(items.map((i) => i.name)).toEqual([
      "ダンボール",
      "チーズフォンデュ用鍋（陶器製）",
      "のみ（大工道具）",
      "HDD（SSD）",
      "臼（石）",
      "臼（木）",
      "うちわ",
    ])
    expect(items[0].noteLines).toEqual([])
    expect(resolveCategoryId(items[1].label)).toBe("moenai-sodai")
    expect(resolveCategoryId(items[3].label)).toBe("fuka")
    expect(joinNote(items[3].noteLines)).toBe(
      "外付け用HDDは「もえないごみ・粗大ごみ」で出せます。内蔵HDDは回収できません。"
    )
    expect(resolveCategoryId(items[5].label)).toBe("kobetsu")
  })
  it("要相談は市の表記を注意文言の先頭に残す", () => {
    const [item] = parseKawachinaganoText(
      HEAD + "臼（木） 要相談 事前にご相談ください\n"
    )
    expect(item.rows[0].note).toBe("出し方: 要相談。\n事前にご相談ください")
  })
})

describe("cutItems: 切り出しの検査(黙って通さない)", () => {
  it("区分名一覧に無い区分の行(品名 区分 備考)が備考に入りそうならエラー", () => {
    expect(() =>
      cutItems([
        "臼（石） 回収できません 建材店等で引き取ってもらう。",
        "臼（木） 未知の区分 事前にご相談ください",
      ])
    ).toThrow(/未知の区分名の疑い/)
  })
  it("区分名で始まる行の前に品目名が無ければエラー", () => {
    expect(() =>
      cutItems([
        "アイロン もえないごみ・粗大ごみ 電池は外して出す。",
        "もえるごみ 推奨袋に入れて出す。",
      ])
    ).toThrow(/品目名がありません/)
  })
  it("品目名のかっこの数が合わなければエラー(折り返した品名の片方が欠けている)", () => {
    expect(() => cutItems(["製のもの） もえるごみ"])).toThrow(
      /備考が混ざっている疑い/
    )
  })
})

describe("実データ(data/cache)の切り出し", () => {
  const text = readFileSync(
    join(__dirname, "../../../data/cache/kawachinagano-city.txt"),
    "utf-8"
  )
  const items = parseKawachinaganoText(text)
  const byName = new Map(items.map((i) => [i.name_ja, i.rows[0]]))
  it("乱れていた品目名が正しい名前で1件ずつある", () => {
    expect(items).toHaveLength(1089)
    expect(byName.size).toBe(items.length)
    for (const name of [
      "オーブントースター",
      "灰皿",
      "ゲームソフト",
      "鉄アレイ（ダンベル）",
      "テレビ台",
      "電子レンジ",
      "精米機",
      "発煙筒",
      "コイン電池（リチウム一時電池）・ボタン電池",
      "ボタン電池・コイン電池（リチウム一時電池）",
      "バッテリー（小型充電式電池）リチウムイオン電池、ニッケル水素電池、ニカド電池",
      "HDD（SSD）",
      "臼（木）",
      "シェード（日よけ）",
      "チーズフォンデュ用鍋（陶器製）",
      "園芸用殺虫剤の容器（プラマークの表示あり）",
      "緩衝材（ビニール製・プラスチック製・発泡スチロール）",
      "発泡スチロール箱（商品購入時の容器として使用されていたもの）",
      "発泡スチロール箱（クーラーボックス等、その物自体が製品として販売されていたもの）",
    ])
      expect(byName.has(name), name).toBe(true)
  })
  it("ほかの品目の行が備考に混ざっていない", () => {
    expect(byName.get("のみ（大工道具）")?.note).not.toMatch(/HDD/)
    expect(byName.get("バッテリー（車・バイク・電動自動車など）")?.note).toBe(
      "取扱店等で引き取ってもらう。"
    )
    expect(byName.get("原動機付自転車")?.note).toMatch(/motorcycle$/)
    expect(byName.get("発泡スチロールトレイ")?.note).toBe("洗って乾かす。")
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
