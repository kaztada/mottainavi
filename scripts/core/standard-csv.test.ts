import { describe, expect, it } from "vitest"
import {
  NOT_COLLECTED_NOTE,
  type StandardCsvConfig,
  buildNote,
  checkConfig,
  normalizeLabel,
  parseStandardCsv,
  readRows,
  resolveCategoryId,
  splitLabels,
  toFullWidthKana,
} from "./standard-csv"

const base: StandardCsvConfig = {
  slug: "test-city",
  name: "テスト市",
  sourceUrl: "https://example.com/gomi.csv",
  encoding: "utf-8",
  headerPrefix: "ごみの分別方法_",
  expectedMinItems: 1,
  labelToId: {
    可燃ごみ: "kanen",
    不燃ごみ: "funen",
    "金属(資源再生物)": "kinzoku",
    リサイクル: "recycle",
    粗大ごみ: "sodai",
    処理困難物: "konnan",
    回収協力店: "kyoryokuten",
    JBRCの回収協力店の回収BOXへ: "kyoryokuten",
  },
  officialLink: {
    kanen: "https://example.com/guide",
    funen: "https://example.com/guide",
    kinzoku: "https://example.com/guide",
    recycle: "https://example.com/guide",
    sodai: "https://example.com/sodai",
    konnan: "https://example.com/guide",
    kyoryokuten: "https://example.com/guide",
  },
  notCollectedIds: ["konnan"],
}

const categories = [
  { id: "kanen", kind: "burnable" },
  { id: "funen", kind: "non-burnable" },
  { id: "kinzoku", kind: "recyclable" },
  { id: "recycle", kind: "maker-recycle" },
  { id: "sodai", kind: "bulky" },
  { id: "konnan", kind: "not-collected" },
  { id: "kyoryokuten", kind: "drop-off" },
]

const header = (prefix: string) =>
  [
    "全国地方公共団体コード",
    "ID",
    "品目",
    "分別区分",
    "注意点",
    "料金種別",
    "料金",
    "料金備考",
    "備考",
  ]
    .map((h) => prefix + h)
    .join(",") + "\n"

describe("toFullWidthKana", () => {
  it("半角カナ(濁点・長音を含む)だけを全角にし、全角のかっこはそのまま", () => {
    expect(toFullWidthKana("ｱｲｽｸﾘｰﾑｶｯﾌﾟ（紙製）")).toBe(
      "アイスクリームカップ（紙製）"
    )
    expect(toFullWidthKana("ﾊﾞｯｸﾞ・ICﾚｺｰﾀﾞ")).toBe("バッグ・ICレコーダ")
    expect(toFullWidthKana("可燃ごみ")).toBe("可燃ごみ")
  })
})

describe("resolveCategoryId", () => {
  it("全角・半角のかっこ、半角カナ、全角英字の表記ゆれを同じ区分に寄せる", () => {
    expect(resolveCategoryId(base, "金属（資源再生物）")).toBe("kinzoku")
    expect(resolveCategoryId(base, "金属(資源再生物)")).toBe("kinzoku")
    expect(resolveCategoryId(base, "ﾘｻｲｸﾙ")).toBe("recycle")
    expect(resolveCategoryId(base, "JBRCの回収協力店の回収ＢＯＸへ")).toBe(
      "kyoryokuten"
    )
  })
  it("未知ラベルは null", () => {
    expect(resolveCategoryId(base, "謎の区分")).toBeNull()
  })
})

describe("splitLabels", () => {
  it("区切りの設定があれば2区分を分け、無ければそのまま", () => {
    const cfg = { ...base, labelSeparator: "又は" }
    expect(splitLabels(cfg, "不燃ごみ又は処理困難物")).toEqual([
      "不燃ごみ",
      "処理困難物",
    ])
    expect(splitLabels(cfg, "粗大ごみ")).toEqual(["粗大ごみ"])
    expect(splitLabels(base, "不燃ごみ又は処理困難物")).toEqual([
      "不燃ごみ又は処理困難物",
    ])
  })
})

describe("buildNote", () => {
  it("市では収集しない区分は、注意点が無くても「市では収集しません」を必ず入れる(注意文言の欠落防止)", () => {
    expect(buildNote(base, "処理困難物", "konnan", "")).toBe(NOT_COLLECTED_NOTE)
    expect(
      buildNote(base, "処理困難物", "konnan", "販売店へご相談ください。")
    ).toBe(`${NOT_COLLECTED_NOTE}\n販売店へご相談ください。`)
  })
  it("区分の説明(categoryNotes)は市の注意点の前に置く", () => {
    const cfg = { ...base, categoryNotes: { sodai: "事前予約制です。" } }
    expect(buildNote(cfg, "粗大ごみ", "sodai", "持ち込みもできます。")).toBe(
      "事前予約制です。\n持ち込みもできます。"
    )
  })
  it("sameAsCategory を指定すると、区分名と違う市の表記を先頭に残す", () => {
    const cfg = { ...base, sameAsCategory: new Set(["可燃ごみ", "回収協力店"]) }
    expect(
      buildNote(
        cfg,
        "JBRCの回収協力店の回収ＢＯＸへ",
        "kyoryokuten",
        "販売店等に相談してください。"
      )
    ).toBe(
      "出し方: JBRCの回収協力店の回収ＢＯＸへ。\n販売店等に相談してください。"
    )
    expect(buildNote(cfg, "可燃ごみ", "kanen", "")).toBeNull()
    // 指定しなければ表記は足さない
    expect(buildNote(base, "JBRCの回収協力店の回収ＢＯＸへ", "kyoryokuten", "")).toBeNull()
  })
  it("3行以上の空行は1つにまとめ、注意点が無い通常の区分は null", () => {
    expect(buildNote(base, "可燃ごみ", "kanen", "a\n\n\n\nb")).toBe("a\n\nb")
    expect(buildNote(base, "可燃ごみ", "kanen", "")).toBeNull()
  })
})

describe("parseStandardCsv", () => {
  it("半角カナを全角にし、2区分の品目は2枚のカードに分けて注意文言を両方に残す", () => {
    const cfg = { ...base, labelSeparator: "又は", fullWidthKana: true }
    const text =
      header(cfg.headerPrefix) +
      "142034,ff0000000002,ICﾚｺｰﾀﾞ,ﾘｻｲｸﾙ,回収協力店へ。,-,-,-,-\n" +
      "142034,ff0000000500,ﾊﾞｽﾏｯﾄ(珪藻土ﾏｯﾄ),不燃ごみ又は処理困難物,石綿を含んでいるものは処理困難物,-,-,-,-\n" +
      "142034,ff0000000805,和服,可燃ごみ,,,,,\n"
    const items = parseStandardCsv(cfg, text)
    expect(items.map((i) => i.name_ja)).toEqual([
      "ICレコーダ",
      "バスマット(珪藻土マット)",
      "和服",
    ])
    const mat = items[1].rows
    expect(mat.map((r) => r.category_label)).toEqual(["不燃ごみ", "処理困難物"])
    expect(mat[0].note).toBe(
      "出し方: 不燃ごみ又は処理困難物。\n石綿を含んでいるものは処理困難物"
    )
    expect(mat[1].note).toBe(
      `${NOT_COLLECTED_NOTE}\n石綿を含んでいるものは処理困難物`
    )
    expect(mat[1].official_link).toBe(base.officialLink.konnan)
    expect(items[2].rows[0].note).toBeNull()
  })
  it("BOM 付き・引用符内の改行を含む CSV を読む(接頭辞が「ゴミ」の自治体)", () => {
    const cfg = { ...base, headerPrefix: "ゴミの分別方法_" }
    const text =
      "﻿" +
      header(cfg.headerPrefix) +
      '272272,,携帯電話,リサイクル,"回収ボックスへ。\n\n\n詳しくはこちら",,,,\n' +
      "272272,,ソファー,粗大ごみ,,,,,\n"
    const items = parseStandardCsv(cfg, text)
    expect(items.map((i) => i.name_ja)).toEqual(["携帯電話", "ソファー"])
    expect(items[0].rows[0].note).toBe("回収ボックスへ。\n\n詳しくはこちら")
    expect(items[1].rows[0].official_link).toBe(base.officialLink.sodai)
  })
  it("extraNoteColumns の列を、注意点の後ろに原文のまま足す", () => {
    const cfg = { ...base, extraNoteColumns: ["料金備考", "備考"] }
    const text =
      header(cfg.headerPrefix) +
      "462012,kg1,いす,可燃ごみ,袋に入らなければ粗大ごみ,無料,-,粗大ごみの料金に準じる,申し込みは電話で\n" +
      "462012,kg2,割りばし,可燃ごみ,,無料,-,,\n" +
      "462012,kg3,消火器,処理困難物,,無料,-,,指定の引取り場所へ\n"
    const items = parseStandardCsv(cfg, text)
    expect(items[0].rows[0].note).toBe(
      "袋に入らなければ粗大ごみ\n粗大ごみの料金に準じる\n申し込みは電話で"
    )
    expect(items[1].rows[0].note).toBeNull()
    expect(items[2].rows[0].note).toBe(
      `${NOT_COLLECTED_NOTE}\n指定の引取り場所へ`
    )
    // 設定した列が CSV に無ければエラー
    expect(() =>
      parseStandardCsv({ ...base, extraNoteColumns: ["謎の列"] }, text)
    ).toThrow("謎の列")
  })
  it("itemNotes は市のデータを変えずに注意文言の先頭へ添え、該当品目が無ければエラー", () => {
    const text =
      header(base.headerPrefix) +
      "462012,kg1,化粧品の容器<プラ製>,可燃ごみ,洗って出す,,,,\n" +
      "462012,kg2,割りばし,可燃ごみ,,,,,\n"
    const cfg = {
      ...base,
      itemNotes: { "化粧品の容器<プラ製>": "※注: 市のページでは別の区分です。" },
    }
    const items = parseStandardCsv(cfg, text)
    expect(items[0].rows[0].category_label).toBe("可燃ごみ")
    expect(items[0].rows[0].note).toBe(
      "※注: 市のページでは別の区分です。\n洗って出す"
    )
    expect(items[1].rows[0].note).toBeNull()
    expect(() =>
      parseStandardCsv({ ...base, itemNotes: { 無い品目: "注記" } }, text)
    ).toThrow("無い品目")
  })
  it("列構成や接頭辞が違えばエラー", () => {
    expect(() => readRows(base, "品目,分別区分\na,b\n")).toThrow("テスト市")
    expect(() => readRows(base, header("ゴミの分別方法_") + "1,,a,b,\n")).toThrow()
  })
})

describe("checkConfig", () => {
  it("整合していれば問題なし", () => {
    expect(checkConfig(base, categories)).toEqual([])
  })
  it("区分IDの不在・公式リンクの欠落・収集しない区分の指定漏れ・正規化されていないキーを指摘する", () => {
    const bad: StandardCsvConfig = {
      ...base,
      labelToId: { ...base.labelToId, "金属（資源再生物）": "nazo" },
      officialLink: { ...base.officialLink, sodai: "" },
      notCollectedIds: [],
    }
    const problems = checkConfig(bad, categories).join("\n")
    expect(problems).toContain("正規化されていません: 金属（資源再生物）")
    expect(problems).toContain("categories.json にありません: nazo")
    expect(problems).toContain("公式リンクがありません: sodai")
    expect(problems).toContain("notCollectedIds にありません: konnan")
  })
})

describe("normalizeLabel", () => {
  it("NFKC にして空白を除く", () => {
    expect(normalizeLabel(" 金属（資源 再生物）")).toBe("金属(資源再生物)")
  })
})
