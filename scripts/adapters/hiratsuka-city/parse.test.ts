import { describe, expect, it } from "vitest"
import categories from "../../../data/municipalities/hiratsuka-city/categories.json"
import {
  CATEGORY_NAME,
  LABEL_TO_ID,
  NOT_COLLECTED,
  OFFICIAL_LINK,
  resolveCategoryId,
} from "./category-map"
import {
  SODAI_NOTE,
  buildNote,
  parseHiratsukaCsv,
  readRows,
  splitLabels,
  toFullWidthKana,
} from "./parse"

const P = "ごみの分別方法_"
const HEADER =
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
    .map((h) => P + h)
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
  it("全角・半角のかっこや半角カナの表記ゆれを同じ区分に寄せる", () => {
    expect(resolveCategoryId("金属（資源再生物）")).toBe("kinzoku")
    expect(resolveCategoryId("金属(資源再生物)")).toBe("kinzoku")
    expect(resolveCategoryId("ﾘｻｲｸﾙ")).toBe("recycle")
    expect(resolveCategoryId("リサイクル")).toBe("recycle")
    expect(resolveCategoryId("容器包装ﾌﾟﾗｽﾁｯｸ")).toBe("pla")
    expect(resolveCategoryId("家電ﾘｻｲｸﾙ")).toBe("kaden")
  })
  it("未知ラベルは null", () => {
    expect(resolveCategoryId("謎の区分")).toBeNull()
  })
})

describe("splitLabels", () => {
  it("「又は」でつながった2区分を分ける", () => {
    expect(splitLabels("不燃ごみ又は処理困難物")).toEqual([
      "不燃ごみ",
      "処理困難物",
    ])
    expect(splitLabels("粗大ごみ")).toEqual(["粗大ごみ"])
  })
})

describe("buildNote", () => {
  it("市では収集しない区分は、注意点が無くても「市では収集しません」を必ず入れる(注意文言の欠落防止)", () => {
    for (const id of NOT_COLLECTED) {
      expect(buildNote(id, "")).toBe("市では収集しません。")
    }
    expect(buildNote("konnan", "販売店などの専門業者へご相談ください。")).toBe(
      "市では収集しません。\n販売店などの専門業者へご相談ください。"
    )
  })
  it("粗大ごみは事前予約制・有料の説明を先頭に置く", () => {
    expect(buildNote("sodai", "持ち込む場合は粗大ごみ破砕処理場へ。")).toBe(
      `${SODAI_NOTE}\n持ち込む場合は粗大ごみ破砕処理場へ。`
    )
  })
  it("注意点が無い通常の区分は null", () => {
    expect(buildNote("kanen", "")).toBeNull()
  })
})

describe("parseHiratsukaCsv", () => {
  it("半角カナを全角にし、2区分の品目は2枚のカードに分けて注意文言を両方に残す", () => {
    const text =
      HEADER +
      "142034,ff0000000002,ICﾚｺｰﾀﾞ,小型家電,回収ボックスに投入してください。,-,-,-,-\n" +
      "142034,ff0000000500,ﾊﾞｽﾏｯﾄ(珪藻土ﾏｯﾄ),不燃ごみ又は処理困難物,石綿(アスベスト)を含んでいるものは処理困難物,-,-,-,-\n" +
      "142034,ff0000000805,和服,布類（資源再生物）,,,,,\n"
    const items = parseHiratsukaCsv(text)
    expect(items.map((i) => i.name_ja)).toEqual([
      "ICレコーダ",
      "バスマット(珪藻土マット)",
      "和服",
    ])
    const mat = items[1].rows
    expect(mat.map((r) => r.category_label)).toEqual(["不燃ごみ", "処理困難物"])
    expect(mat[0].note).toBe(
      "出し方: 不燃ごみ又は処理困難物。\n石綿(アスベスト)を含んでいるものは処理困難物"
    )
    expect(mat[1].note).toBe(
      "市では収集しません。\n石綿(アスベスト)を含んでいるものは処理困難物"
    )
    expect(mat[1].official_link).toBe(OFFICIAL_LINK.konnan)
    expect(items[2].rows[0].note).toBeNull()
  })
  it("列構成が違えばエラー", () => {
    expect(() => readRows("品目,分別区分\na,b\n")).toThrow()
  })
})

describe("category-map と categories.json の整合", () => {
  it("マップ先・公式リンク・表示名の区分IDがすべて categories.json にあり、名前が一致する", () => {
    const byId = new Map(categories.map((c) => [c.id, c]))
    for (const id of Object.values(LABEL_TO_ID)) expect(byId.has(id)).toBe(true)
    for (const c of categories) {
      expect(OFFICIAL_LINK[c.id]).toBeTruthy()
      expect(CATEGORY_NAME[c.id]).toBe(c.name_ja)
    }
  })
  it("市では収集しない区分は kind not-collected", () => {
    for (const id of NOT_COLLECTED) {
      expect(categories.find((c) => c.id === id)?.kind).toBe("not-collected")
    }
  })
})
