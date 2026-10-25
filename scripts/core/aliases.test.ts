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
  it("1文字の語(油・本)は注記のない完全一致のときだけ付く", () => {
    expect(aliasesOf("油")).toContain("cooking oil")
    expect(aliasesOf("油（食用）")).toEqual([])
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
    expect(aliasesOf("ノートパソコン")).toEqual(
      expect.arrayContaining(["PC", "laptop", "computer"])
    )
    expect(aliasesOf("ノートパソコン")).not.toContain("デスクトップパソコン")
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

describe("遮断リスト: 語で終わっても別の物(入間市、2026-10-25 の Codex の指摘)", () => {
  it.each(["自転車用補助いす", "シューズドライヤー", "サマーベッド", "チューブベッド", "ウッドカーペット"])(
    "%s には親の語の別名が付かない",
    (name) => {
      expect(aliasesOf(name)).toEqual([])
    }
  )
})

describe("注記で別の物になる品目(Codex の指摘 2026-10-23)", () => {
  it.each([
    "油（食用以外）",
    "油（機械用）",
    "油（動物性食用油）",
    "靴（スキー靴）",
    "鏡（手鏡）",
    "本（アルバム）",
    "傘（骨）【金属】",
    "紙パック（牛乳パック以外のもの）",
  ])("%s には語の別名が付かない", (name) => {
    expect(aliasesOf(name)).toEqual([])
  })
  it("1文字の語でも注記のない品目名・「類」だけを外した品目名には付く", () => {
    expect(aliasesOf("油")).toContain("サラダ油")
    expect(aliasesOf("本類")).toContain("単行本")
    expect(aliasesOf("鏡")).toContain("姿見")
  })
  it("注記だけで意味が変わらない2文字以上の語には付く", () => {
    expect(aliasesOf("ストーブ（電気・ガス・灯油）")).toContain("ヒーター")
    expect(aliasesOf("ペットボトル(切断したもの)")).toContain("PET")
  })
  it("かなをそろえると語尾が合ってしまう品目(スパイス・アイス・ライス)にいすの別名を付けない", () => {
    expect(aliasesOf("香辛料・スパイス・薬味")).toEqual([])
    expect(aliasesOf("アイス")).toEqual([])
    expect(aliasesOf("ライス")).toEqual([])
    expect(aliasesOf("風呂いす")).toContain("チェア")
  })
  it("ストーブ・電球の限定付き品目には、限定にその種類の言葉がある兄弟の別名だけ付く", () => {
    expect(aliasesOf("ストーブ（電気）")).not.toContain("石油ストーブ")
    expect(aliasesOf("ストーブ（電気）")).toContain("ヒーター")
    expect(aliasesOf("ストーブ（電気・ガス）")).not.toContain("石油ストーブ")
    expect(aliasesOf("ストーブ（石油）")).toContain("石油ストーブ")
    expect(aliasesOf("ストーブ（電気・ガス・灯油）")).toContain("石油ストーブ")
    expect(aliasesOf("ストーブ（石油ストーブを除く）")).not.toContain(
      "石油ストーブ"
    )
    expect(aliasesOf("ストーブ　電気・ガス")).not.toContain("石油ストーブ")
    expect(aliasesOf("ストーブ　電気・ガス")).toContain("ヒーター")
    expect(aliasesOf("電球（蛍光灯）")).not.toContain("LED電球")
    expect(aliasesOf("ストーブ")).toContain("石油ストーブ")
  })
  it("ほかの語は限定が素材や用途なので、総称の品目に兄弟の別名を付ける", () => {
    expect(aliasesOf("ソファー(二人掛け用以上)")).toContain("ソファ")
    expect(aliasesOf("ギター（木製）")).toContain("エレキギター")
    expect(aliasesOf("ギター（電動以外）")).toContain("アコギ")
    expect(aliasesOf("パソコン（本体）")).toContain("ノートパソコン")
  })
  it("DVD・CD は機器(プレーヤー・ドライブ)の一部のとき媒体の別名を付けない", () => {
    expect(aliasesOf("DVD・ブルーレイディスクプレーヤー")).toEqual([])
    expect(aliasesOf("DVD/CDドライブ")).toEqual([])
    expect(aliasesOf("CD、CDケース")).toContain("シーディー")
  })
  it("アコギはエレキギターに付かない。アコースティックギターには付く", () => {
    expect(aliasesOf("エレキギター")).not.toContain("アコギ")
    expect(aliasesOf("エレキギター")).toContain("guitar")
    expect(aliasesOf("アコースティックギター")).toContain("アコギ")
    expect(aliasesOf("ギター")).toContain("アコギ")
  })
  it("クーラーは名前が一致するときだけ(ワインクーラーにエアコンを付けない)", () => {
    expect(aliasesOf("クーラー(エアコン)")).toContain("エアコン")
    expect(aliasesOf("ワインクーラー")).toEqual([])
  })
  it("兄弟の別名でも品目名自身が含むなら付く(並び順で語そのものの品目が先頭に出ない)", () => {
    expect(aliasesOf("電子オルガン・電子ピアノ")).toContain("電子ピアノ")
    expect(aliasesOf("ガスストーブ")).not.toContain("石油ストーブ")
    expect(aliasesOf("電気ストーブ（石油ストーブを除く）")).not.toContain(
      "石油ストーブ"
    )
    expect(aliasesOf("ストーブ（石油ストーブを除く）")).not.toContain(
      "石油ストーブ"
    )
  })
})

describe("カッコの中の同義語・空白で区切った限定(Codex の4回目の指摘 2026-10-23)", () => {
  it("カッコの中の語の別名が外の部分なら同義語として付く", () => {
    expect(aliasesOf("椅子（いす）")).toContain("チェア")
    expect(aliasesOf("バッグ（かばん）")).toContain("bag")
    expect(aliasesOf("クーラー(エアコン)")).toContain("air conditioner")
  })
  it("用途の説明のカッコ(パソコン)は同義語ではないので付かない", () => {
    expect(aliasesOf("液晶ディスプレイ(パソコン)")).toEqual([])
    expect(aliasesOf("キーボード（パソコン）")).toEqual([])
  })
  it("空白のあとの限定は、前の語を打ち消さない(空き缶　飲料・食用油・食料品用)", () => {
    expect(aliasesOf("空き缶　飲料・食用油・食料品用")).toContain("can")
    expect(aliasesOf("空き缶　オイル・塗料・シンナー用など")).toContain("can")
  })
  it("「ガラス食器・ガラスの破片」の前の部分は語で終わるので付く", () => {
    expect(aliasesOf("ガラス食器・ガラスの破片")).toContain("tableware")
  })
  it("ふとん(ひらがな)は名前が一致するときだけ。磁気ふとん・羽毛ふとんには付かない", () => {
    expect(aliasesOf("ふとん")).toContain("敷布団")
    expect(aliasesOf("磁気ふとん")).toEqual([])
    expect(aliasesOf("羽毛ふとん")).toEqual([])
  })
  it("携帯ゲーム機器にも付く", () => {
    expect(aliasesOf("携帯ゲーム機器")).toContain("Switch")
  })
})

describe("許可リスト(TAIL_ALLOW): 語のあとに続いても同じ物", () => {
  it.each([
    ["タブレット端末", "iPad"],
    ["タブレット型コンピューター", "tablet"],
    ["DVDディスク", "Blu-ray"],
    ["CDディスク", "シーディー"],
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
    expect(aliasesOf("DVDプレーヤー")).not.toContain("Blu-ray")
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
    ["ラタンキャリーバッグ", "スーツケース"],
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
    ["ふとん", "布団"],
    ["DVDプレーヤー", "DVD player"],
    ["ＤＶＤプレイヤー（ポータブル品含む）", "DVDプレーヤー"],
    ["ＣＤプレーヤー", "CD player"],
  ])("品目「%s」を「%s」で引ける", (name, alias) => {
    expect(aliasesOf(name)).toContain(alias)
  })
  it("針と注射器・紙パックと牛乳パック・剪定枝と落ち葉は共通辞書では言い換えない(別の区分の品目へ誘導する)", () => {
    expect(aliasesOf("注射器本体（在宅医療廃棄物）")).not.toContain("注射針")
    expect(aliasesOf("注射針（在宅医療廃棄物）")).not.toContain("注射器")
    expect(aliasesOf("酒の紙パック")).not.toContain("牛乳パック")
    expect(aliasesOf("紙パック（牛乳パック以外のもの）")).toEqual([])
    expect(aliasesOf("剪定ごみ(刈り葉、落ち葉)")).not.toContain("剪定枝")
    expect(aliasesOf("買い物袋")).not.toContain("レジ袋")
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
