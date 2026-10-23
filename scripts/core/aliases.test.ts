import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  TAIL_ALLOW,
  TAIL_BLOCK,
  TAIL_PREFIX,
  buildItemAliases,
  legacyItemAliases,
  splitName,
} from "./aliases"
import { COMMON_ALIASES_PATH } from "./paths"

const common: Record<string, string[]> = JSON.parse(
  readFileSync(COMMON_ALIASES_PATH, "utf-8")
)

const aliasesOf = (name: string, dict = common) => buildItemAliases(name, dict)

describe("splitName", () => {
  it("カッコ・※以降の注記を外し、「・」「、」で区切る", () => {
    expect(splitName("キーボード(パソコン用)")).toEqual(["キーボード"])
    expect(splitName("携帯電話、スマートホン<バッテリー外せる>")).toEqual([
      "携帯電話",
      "スマートホン",
    ])
    expect(splitName("時計※掛け時計・置き時計")).toEqual(["時計"])
    expect(splitName("空きびん－化粧品用")).toEqual(["空きびん", "化粧品用"])
  })
})

describe("buildItemAliases: 語と一致(注記を除く)", () => {
  it("辞書の語と同じ品目名には全部の別名が付く", () => {
    expect(aliasesOf("ストーブ")).toEqual(
      expect.arrayContaining(["ヒーター", "石油ストーブ", "stove"])
    )
    expect(aliasesOf("ストーブ（電気・ガス・灯油）")).toContain("石油ストーブ")
    expect(aliasesOf("ペットボトル(切断したもの)")).toContain("PET")
  })
  it("1文字の語(油・本)は完全に一致するときだけ付く", () => {
    expect(aliasesOf("油（食用）")).toContain("cooking oil")
    expect(aliasesOf("食用の油よけ")).not.toContain("cooking oil")
  })
  it("「本体」「類」「一式」と末尾の数字は外して比べる", () => {
    expect(aliasesOf("ゲーム機本体")).toContain("Switch")
    expect(aliasesOf("家庭用ゲーム機１")).toContain("Switch")
    expect(aliasesOf("本類")).toContain("文庫本")
  })
  it("かな・全角半角の違いを吸収する", () => {
    expect(aliasesOf("たんす")).toContain("箪笥")
    expect(aliasesOf("ＤＶＤ")).toContain("Blu-ray")
  })
  it("市の辞書のキー(品目名そのもの)で付く", () => {
    const dict = { ...common, "電池（ABC）": ["単三電池"] }
    expect(aliasesOf("電池（ABC）", dict)).toContain("単三電池")
  })
})

describe("buildItemAliases: 付属品・別の物には付かない(案A)", () => {
  it.each([
    "キーボード(パソコン用)",
    "パソコンラック",
    "ベッドカバー",
    "テレビ台",
    "テレビの室内アンテナ",
    "ペットボトルのキャップ",
    "携帯電話の充電器",
    "羽毛布団カバー",
    "ペンキ",
  ])("%s には辞書の別名が付かない", (name) => {
    expect(aliasesOf(name)).toEqual([])
  })
  it("「A・BのC」は最後の部分だけ見る(自転車・バイクのアクセサリー)", () => {
    expect(aliasesOf("自転車・バイクのアクセサリー")).toEqual([])
  })
  it("ペンキが電気ストーブなど無関係な品目に付かない", () => {
    expect(aliasesOf("電気ストーブ")).not.toContain("ペンキ")
  })
})

describe("buildItemAliases: 下位の種類(名前の最後が語)", () => {
  it("語を含まない別名だけ付く", () => {
    expect(aliasesOf("ノートパソコン")).toEqual(["PC", "laptop", "computer"])
    expect(aliasesOf("ベビーベッド")).toEqual(["bed"])
  })
  it("兄弟の別名(石油ストーブ・LED電球)は付かない", () => {
    expect(aliasesOf("電気ストーブ")).not.toContain("石油ストーブ")
    expect(aliasesOf("電気ストーブ")).toContain("ヒーター")
    expect(aliasesOf("豆電球")).not.toContain("LED電球")
    expect(aliasesOf("豆電球")).toContain("light bulb")
  })
  it("「石油ストーブ」の品目があっても電気ストーブには付かない", () => {
    expect(aliasesOf("ガスストーブ")).not.toContain("石油ストーブ")
  })
  it("名前の途中・先頭にだけ語があるものには付かない", () => {
    expect(aliasesOf("ベッドの下の収納ケース")).toEqual([])
    expect(aliasesOf("パソコン用の机")).toEqual([])
  })
})

describe("許可リスト(TAIL_ALLOW): 語のあとに続いても同じ物", () => {
  it.each([
    ["タブレット端末", "iPad"],
    ["タブレット型コンピューター", "tablet"],
    ["DVDプレーヤー", "Blu-ray"],
    ["ＤＶＤプレイヤー（ポータブル品含む）", "ディーブイディー"],
    ["CDプレーヤー", "シーディー"],
    ["新聞紙", "newspaper"],
    ["蛍光灯管", "蛍光管"],
    ["段ボール箱", "cardboard"],
    ["携帯電話端末（スマートフォンを含む）", "ガラケー"],
  ])("%s に %s が付く", (name, alias) => {
    expect(aliasesOf(name)).toContain(alias)
  })
  it("許可リストに無い言葉が続くと付かない", () => {
    expect(aliasesOf("タブレット菓子のケース")).toEqual([])
    expect(aliasesOf("タブレット用ケース")).toEqual([])
    expect(aliasesOf("DVDケース")).toEqual([])
  })
  it("許可リストの語はすべて辞書にある", () => {
    for (const key of Object.keys(TAIL_ALLOW))
      expect(common).toHaveProperty(key)
  })
})

describe("遮断リスト(TAIL_BLOCK)と前の言葉の指定(TAIL_PREFIX)", () => {
  it.each([
    ["座布団", "futon"],
    ["原動機付自転車", "bicycle"],
    ["砂時計", "clock"],
    ["エアロバイク", "motorcycle"],
    ["水上バイク", "motorcycle"],
    ["タイプライター", "lighter"],
    ["アーケードゲーム機", "Switch"],
    ["掃除機の紙パック", "milk carton"],
    ["プラスチックダンボール", "cardboard"],
    ["LED蛍光管", "蛍光灯"],
    ["車いす", "chair"],
  ])("%s に %s は付かない", (name, alias) => {
    expect(aliasesOf(name)).not.toContain(alias)
  })
  it("遮断リストに無い下位の種類には付く", () => {
    expect(aliasesOf("羽毛布団")).toContain("futon")
    expect(aliasesOf("ミニバイク")).toContain("motorcycle")
    expect(aliasesOf("使い捨てライター")).toContain("百円ライター")
  })
  it("ポットは前の言葉が合うときだけ(苗ポット・フラワーポットには付かない)", () => {
    expect(aliasesOf("苗ポット")).toEqual([])
    expect(aliasesOf("フラワーポット")).toEqual([])
    expect(aliasesOf("キャンディーポット")).toEqual([])
    expect(aliasesOf("湯沸かしポット")).toContain("kettle")
    expect(aliasesOf("ポット")).toContain("kettle")
  })
  it("リストの語はすべて辞書にある", () => {
    for (const key of [
      ...Object.keys(TAIL_BLOCK),
      ...Object.keys(TAIL_PREFIX),
    ]) {
      expect(common).toHaveProperty(key)
    }
  })
})

describe("言い換え辞書(1字違いでない言い換え)", () => {
  it.each([
    ["蛍光管", "蛍光灯"],
    ["蛍光管（割れていないもの）", "蛍光灯"],
    ["アルカリ電池", "乾電池"],
    ["携帯電話、スマートホン<バッテリー外せる>", "スマホ"],
    ["除湿器", "除湿機"],
    ["除湿機", "除湿器"],
    ["充電式電池", "充電池"],
    ["充電電池", "充電池"],
    ["オートバイ", "バイク"],
    ["バイク（原付）", "オートバイ"],
    ["注射器", "注射針"],
    ["注射針（在宅医療用）", "注射器"],
    ["ダンボール", "段ボール"],
    ["釣り竿（竹製）", "釣竿"],
    ["釣竿", "釣り竿"],
    ["釣りざお", "釣り竿"],
    ["携帯電話", "ガラケー"],
    ["スーツケース（キャリーケース）", "キャリーバッグ"],
    ["キャリーバッグ", "スーツケース"],
    ["ゴルフバック", "ゴルフバッグ"],
    ["雑紙", "雑がみ"],
    ["ズック（スニーカー・スパイクシューズ）", "スニーカー"],
    ["ガラスくず（破片）", "割れたガラス"],
    ["剪定ごみ(枝)", "剪定枝"],
    ["買い物袋（レジ袋）", "ビニール袋"],
    ["紙パック", "牛乳パック"],
  ])("品目「%s」を「%s」で引ける", (name, alias) => {
    expect(aliasesOf(name)).toContain(alias)
  })
  it("言い換えが別の品目に誤って付かない", () => {
    expect(aliasesOf("蛍光ペン")).toEqual([])
    expect(aliasesOf("電気ストーブ")).not.toContain("ペンキ")
    expect(aliasesOf("ペンキ缶")).not.toContain("オートバイ")
  })
})

describe("legacyItemAliases(以前の付け方。影響の比較用)", () => {
  it("品目名に語が含まれれば付く", () => {
    expect(legacyItemAliases("ベッドカバー", common)).toContain("bed")
    expect(legacyItemAliases("テレビ台", common)).toContain("TV")
  })
})
