import {
  type StandardCsvAdapter,
  type StandardCsvConfig,
  createStandardCsvAdapter,
  parseStandardCsv,
} from "../../core/standard-csv"
import { toStandardCsv } from "./convert"

/**
 * 長浜市「ごみ分別表」(BODIK オープンデータ、CC BY 4.0、UTF-8 CSV、2025年4月1日時点)。
 * 見出し行が無い4列(品目, よみ, 区分, 備考)なので、標準形式の列の並びに直してから(convert.ts)
 * 共通アダプタで読む。ごみ処理は湖北広域行政事務センター(長浜市・米原市)が担っている。
 * センターの「ごみ分別辞典」(ごみサク 0082)と全件照合済み(2026-10-03)。
 * 取得元の URL は data/municipalities/nagahama-city/source.json。更新は BODIK の API で見張る(scripts/update-data.ts)。
 */
const BASE = "https://www.city.nagahama.lg.jp/"
const SHIGEN = BASE + "0000007928.html" // 資源ごみの種類と出し方
const SODAI = BASE + "0000010270.html" // 粗大ごみ

const CENTER = "湖北広域行政事務センター(0749-62-7143)"
const JITEN = "湖北広域行政事務センターの「ごみ分別辞典」"

export const nagahamaCityConfig: StandardCsvConfig = {
  slug: "nagahama-city",
  name: "長浜市",
  watch: {
    kind: "ckan",
    api: "https://data.bodik.jp/api/3/action/package_show?id=252034_garbage_separation",
  },
  encoding: "utf-8",
  headerPrefix: "",
  expectedMinItems: 1200,
  fullWidthKana: true,
  labelToId: {
    可燃ごみ: "kanen",
    不燃ごみ: "funen",
    粗大ごみ: "sodai",
    可燃性粗大ごみ: "kanen-sodai",
    プラスチック製容器包装: "pla",
    発泡スチロール: "happo",
    古紙: "koshi",
    紙パック: "kami-pack",
    "古布(古着)": "kofu",
    ガラスびん: "bin",
    空き缶類: "kan",
    ペットボトル: "pet",
    使用ずみ乾電池類: "denchi",
    "スプレー缶類(燃料缶等を含む)": "spray",
    ライター: "lighter",
    使用ずみ蛍光管: "keikokan",
    直接持込品目: "mochikomi",
    家電リサイクル: "kaden",
    受け入れできないもの: "fuka",
  },
  officialLink: {
    kanen: BASE + "0000010268.html",
    funen: BASE + "0000010269.html",
    sodai: SODAI,
    "kanen-sodai": SODAI,
    pla: BASE + "0000000400.html",
    happo: SHIGEN,
    koshi: SHIGEN,
    "kami-pack": SHIGEN,
    kofu: SHIGEN,
    bin: SHIGEN,
    kan: SHIGEN,
    pet: SHIGEN,
    denchi: SHIGEN,
    spray: BASE + "0000002381.html",
    lighter: SHIGEN,
    keikokan: BASE + "0000014876.html",
    mochikomi: BASE + "0000011435.html",
    kaden: BASE + "0000000391.html",
    fuka: BASE + "0000000398.html",
  },
  notCollectedIds: ["kaden", "fuka"],
  // 市のページ(粗大ごみ、よくある質問、資源ごみの種類と出し方、家電リサイクル法対象品目)の説明
  categoryNotes: {
    // 電池の入った機器が不燃ごみに多い(ゲーム機・ヘッドフォンなど)のに、市のデータでは注意書きが空の品目があるため
    funen:
      "スプレー缶類・ライター・電池は不燃ごみに出せません(資源ごみへ)。電池を使う製品は電池を外し、充電池を取り外せない小型電子機器は本体ごと資源ごみの「使用ずみ乾電池類」に出します。",
    sodai:
      "年2回の粗大ごみの日に、「エフ」(1品目に1枚)を付けて地域の集積所に出します。事前の申込みは不要で、エフを使う場合は年間6品目まで無料です。出せる大きさは学習机程度まで、重さは60キログラム程度までです。これより大きいものや一時的に多く出たものは、施設へ直接持ち込むか(10キログラムまでごとに80円)、有料の粗大ごみ戸別収集(1品目600円または900円。粗大ごみ受付センター 0749-65-1870)を利用します。",
    "kanen-sodai":
      "布団・畳・カーペットなどの柔らかい粗大ごみです。年2回の粗大ごみの日に、「エフ」(1品目に1枚)を付けて地域の集積所に出します。事前の申込みは不要です。",
    denchi:
      "月2回の資源ごみの日に、「使用ずみ乾電池類」の回収容器に入れて出します。",
    // 市のデータの注意点には、穴あけの場所の条件(火の気のない屋外)が無い。市のページとよくある質問から補う
    spray:
      "月2回の資源ごみの日に、「スプレー缶類」の回収容器に入れて出します。穴をあけるときは、中身を使い切ってから、必ず火の気のない屋外で行ってください。中身を使い切れないスプレー缶は市では処分できないので、商品に書かれた問い合わせ先か販売元にご相談ください。",
    // 持ち込み先は品目ごとに違う(動物の死骸・火鉢の灰はクリスタルプラザ)ので、ここでは施設を決めつけない
    mochikomi:
      "集積所には出せません。品目ごとの案内にある施設へ直接持ち込みます(クリーンプラントは長浜・浅井・びわ・虎姫・湖北・高月地域、伊香クリーンプラザは木之本・余呉・西浅井地域の方が対象)。",
    kaden: "家電リサイクル法の対象品目です。粗大ごみには出せません。",
  },
  // 市のデータと、センターの分別辞典・市の案内が食い違う品目(2026-10-03 照合)。市のデータは書き換えない
  itemNotes: {
    ポスト: `※もったいナビ注: 市のデータには「不燃ごみ」と「可燃ごみ」の2つの行があります。${JITEN}では「不燃ごみ」と案内されています。迷ったら${CENTER}にご確認ください。`,
    "給湯器（台所用）": `※もったいナビ注: ${JITEN}では「不燃ごみ(不燃ごみ指定袋に入らないものは粗大ごみ)」と案内されています。最新は公式サイトでご確認ください。`,
    水槽: `※もったいナビ注: ${JITEN}では「不燃ごみ(不燃ごみ指定袋に入らないものは粗大ごみ)」と案内されています。最新は公式サイトでご確認ください。`,
    化粧品の紙箱: `※もったいナビ注: ${JITEN}では「可燃ごみ」と案内されています。最新は公式サイトでご確認ください。`,
    "シェーバー（ひげ剃り機）": `※もったいナビ注: 充電式で電池を取り外せないものは、不燃ごみではなく資源ごみの「使用ずみ乾電池類」に出すよう、市とセンターが案内しています(2024年4月から。発火のおそれがあるため)。乾電池式は、電池を外して不燃ごみへ。迷ったら${CENTER}にご確認ください。`,
    "ICレコーダー（リチウムイオン電池内蔵）": `※もったいナビ注: 市の案内では、充電池を取り外せない小型電子機器は、不燃ごみではなく資源ごみの「使用ずみ乾電池類」に出します(2024年4月から。発火のおそれがあるため)。迷ったら${CENTER}にご確認ください。`,
  },
}

const base = createStandardCsvAdapter(nagahamaCityConfig)

export const nagahamaCityAdapter: StandardCsvAdapter = {
  ...base,
  parse: (source) =>
    parseStandardCsv(nagahamaCityConfig, toStandardCsv(source)),
}
