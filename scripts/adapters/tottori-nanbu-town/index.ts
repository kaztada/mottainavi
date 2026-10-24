import {
  type StandardCsvAdapter,
  type StandardCsvConfig,
  createStandardCsvAdapter,
  parseStandardCsv,
} from "../../core/standard-csv"
import { toStandardCsv } from "./convert"

/**
 * 鳥取県南部町。鳥取県オープンデータポータル「南部町ゴミの分別方法一覧」(CC BY 2.1 日本、Shift_JIS、791品目、2026年4月時点)。
 * 町の「家庭ごみの分け方・出し方(五十音順)」令和7年度改訂版(2026-03)と全件照合済み(2026-10-24。名前で対応がとれた
 * 590品目のうち区分一致580、食い違い8のうち誤案内につながるのはモバイルバッテリーだけ)。
 * 原本は列が1つずれている(区分が「注意点」の列、注意書きが「料金種別」の列。「分別区分」の列は全行空)ので、
 * convert.ts で標準形式に読み替えてから共通アダプタで読む。
 * 不燃粗大ごみは申込制ではなく、袋に入れずに集落の指定場所へ出す(冊子)ので、bulky にしない(non-burnable + accepts_large_items)。
 * 町のサイト本体はオープンデータではないので、区分の説明は町のページ・冊子・小型家電の案内の事実を自分の言葉で書いた。
 * 取得元の URL は data/municipalities/tottori-nanbu-town/source.json。
 */
const GOMI = "https://www.town.nanbu.tottori.jp/admin/chouminseikatsuka/gomi1/"
const BUNBETSU = GOMI + "g141/" // 南部町ごみの分け方・出し方(50音順)
const CALENDAR = GOMI + "y145/" // 令和8年度ごみ収集カレンダー・ごみの分別表(2026-03)
const KOGATA =
  "https://www.town.nanbu.tottori.jp/user/filer_public/68/cf/68cf28ad-0e33-48f4-917e-003b02264aac/gomi-kogatakaden.pdf" // 使用済み小型家電の回収
const NOTCOLLECTED =
  "https://www.town.nanbu.tottori.jp/user/filer_public/d1/d3/d1d3f4ce-3619-45b9-9b97-b211c7f86fe4/gomi-notcollected.pdf" // 南部町が収集しないもの

const NOTE = "※もったいナビ注: "

const TEL = "町民生活課(法勝寺庁舎 0859-66-3114・天萬庁舎 0859-64-3781)"

/** 電池の出し方(データの注意点・町のごみ収集カレンダー令和8年度・使用済み小型家電の案内) */
const BATTERY =
  "電池で動くものは、電池(バッテリー)を外してから出します。外した乾電池(アルカリ・マンガン)は「乾電池」へ。ボタン電池・充電式電池(ニカド・ニッケル水素・リチウムイオンで、リサイクルマークのあるもの)・モバイルバッテリーは、端子をビニールテープなどで絶縁して役場(法勝寺庁舎・天萬庁舎)の町民生活課の回収ボックスへ出します(リチウム一次電池は出せません。マークの無い電池は町民生活課に相談)。電動工具などのバッテリーで、品目ごとに「購入先・処理業者へ」とあるものは、それに従います。充電式電池が取り外せない製品は、ごみ置き場に出さず、役場(法勝寺庁舎・天萬庁舎)の小型家電リサイクルで回収します(町の50音表。電子たばこなど、品目ごとに出し先の案内があるものはそれに従います)。車・オートバイ用のバッテリーや電動アシスト自転車のバッテリーは町では収集しません(購入先・処理業者へ)。"

/** 灯油・燃料を使う器具(データの石油ストーブ・灯油缶などの注意点。灯油そのものは「収集しない」) */
const TOYU =
  "石油ストーブ・ボイラー・ポリタンク・灯油缶・給油ポンプなど灯油を使うものは、中の灯油(燃料)を空にしてから出します(灯油そのものは町では収集しません。購入先・処理業者に相談)。"

const FUNEN_RULE =
  "スプレー缶・カセットボンベ・ライターは、中身を使い切って穴を開けずに出します(品目ごとの案内に従います)。"

const SIZE_RULE =
  "大きさで区分が分かれます。60cm未満は不燃ごみ、60cm以上で1m×1m×2m以下のものは不燃粗大ごみです(品目ごとの案内に従います)。2mを超えるものは収集しません。"

const KOGATA_HOW =
  "役場の法勝寺庁舎・天萬庁舎に回収ボックスがあります(投入口に入らないものは町民生活課の窓口へ)。個人情報は必ず消去します。蛍光管・電球は必ず取り外し、電池・バッテリーはできるだけ取り外します。事業所から出たもの、家電4品目、電子たばこ、乾電池、インクカートリッジ、こたつ・電気カーペットなど可燃部分のあるもの、石油ファンヒーターなど燃料を使うもの、ガスや油脂を含むものは回収できません。燃えるごみ・燃えないごみとして出す場合は品目ごとの案内に従います。"

const MOBILE_BATTERY = `${NOTE}町の50音表(令和7年度改訂版)では「収集しない(小型家電リサイクルを利用、またはメーカー等へ)」とあり、令和8年度のごみ収集カレンダー(2026-03)では「リチウムイオン電池は役場の回収ボックスへ」とあって、町の資料どうしが食い違っています。このデータ(2026年4月時点)は役場町民生活課の回収へ。端子を絶縁して役場の回収ボックスへ出し、ごみ置き場には出さないでください。迷うときは${TEL}へ。最新は公式サイトでご確認ください。`

const PC = `${NOTE}町の「使用済み小型家電の回収」の案内では、パソコン・タブレットなども役場(法勝寺庁舎・天萬庁舎)の回収ボックスで回収するとされています(個人情報は消去してから)。メーカーや購入先の回収も使えます。最新は公式サイトでご確認ください。`

export const tottoriNanbuTownConfig: StandardCsvConfig = {
  slug: "tottori-nanbu-town",
  name: "鳥取県南部町",
  watch: {
    kind: "page-content",
    pageUrl:
      "https://odp-pref-tottori.tori-info.co.jp/dataset/1874/resource/9580/313891_garbage_separation.csv",
    select: (text) => text,
  },
  encoding: "shift_jis",
  headerPrefix: "",
  expectedMinItems: 750,
  labelToId: {
    可燃: "kanen",
    不燃: "funen",
    不燃粗大: "funen-dai",
    "不燃【小型家電リサイクル対象】": "kogata",
    "不燃粗大【小型家電リサイクル対象】": "kogata-dai",
    役場町民生活課へ: "yakuba",
    乾電池: "kandenchi",
    蛍光管: "keikou",
    収集しない: "fuka",
    布類: "nuno",
    "ビン・缶類": "binkan",
    再利用ビン: "saibin",
    ペットボトル: "pet",
    軟プラ類: "pla",
    "古紙類(雑誌・雑紙)": "zasshi",
    "古紙類(ダンボール・箱)": "danboru",
    "古紙類(牛乳パック)": "pack",
    "古紙類(新聞・チラシ)": "shinbun",
    小雑紙: "kozasshi",
  },
  officialLink: {
    kanen: BUNBETSU,
    funen: BUNBETSU,
    "funen-dai": BUNBETSU,
    kogata: KOGATA,
    "kogata-dai": KOGATA,
    yakuba: CALENDAR,
    kandenchi: CALENDAR,
    keikou: CALENDAR,
    fuka: NOTCOLLECTED,
    nuno: BUNBETSU,
    binkan: BUNBETSU,
    saibin: BUNBETSU,
    pet: BUNBETSU,
    pla: BUNBETSU,
    zasshi: BUNBETSU,
    danboru: BUNBETSU,
    pack: BUNBETSU,
    shinbun: BUNBETSU,
    kozasshi: BUNBETSU,
  },
  notCollectedIds: ["fuka"],
  // 町のページ(ごみの分け方・出し方、令和8年度ごみ収集カレンダー、使用済み小型家電の回収、収集しないもの)の事実
  categoryNotes: {
    kanen:
      "収集日の午前8時までに、集落の決められた場所へ出します(収集日は令和8年度ごみ収集カレンダーで)。大きな木製家具などは、50cm以下に切って指定の大きい袋をくくり付けて出すか、民間のリサイクルセンターに有料で持ち込みます(品目ごとの案内に従います)。",
    funen: `収集日の午前8時までに、集落の決められた場所へ出します。${SIZE_RULE}${FUNEN_RULE}${TOYU}${BATTERY}`,
    "funen-dai": `申込みは要りません。袋に入れずに、収集日の午前8時までに集落の決められた場所へ出します。60cm以上で、1m×1m×2m以下の電気製品・金属製品などが対象です(60cm未満は不燃ごみ。2mを超えるものは収集しません。品目ごとの案内に従います)。${TOYU}${BATTERY}`,
    kogata: `不燃ごみとして出せますが、小型家電リサイクルの回収ボックスにも出せます。${KOGATA_HOW}${SIZE_RULE}${TOYU}${BATTERY}`,
    "kogata-dai": `不燃粗大ごみとして、袋に入れずに集落の決められた場所へ出せます(申込みは要りません)。小型家電リサイクルの回収ボックスにも出せます。${KOGATA_HOW}${SIZE_RULE}${TOYU}${BATTERY}`,
    yakuba: `役場(法勝寺庁舎・天萬庁舎)の町民生活課の回収ボックスへ持ち込みます(ごみ置き場には出しません)。ボタン電池・充電式電池・モバイルバッテリー・リチウムイオン電池は端子をビニールテープなどで絶縁します(リチウム一次電池は出せません)。水銀を使った体温計・温度計もここへ(ケースは品目ごとの案内に従います)。${TEL}。${BATTERY}`,
    kandenchi: `収集日に、透明の袋に入れて出します(アルカリ電池・マンガン電池だけ。ボタン電池・充電式電池は役場の回収ボックスへ)。${BATTERY}`,
    keikou:
      "品目ごとの案内に従って、割れたものは透明な袋に入れて出します(品番の最初のアルファベットが「F」「EF」「HF」以外は不燃ごみ)。",
    fuka: `町では収集しません。購入先・処理業者・メーカーなど、品目ごとの案内の窓口に相談してください。家電4品目(テレビ・エアコン・冷蔵庫・冷凍庫・洗濯機・衣類乾燥機)は家電リサイクル法の対象です。パソコンは役場の小型家電の回収ボックスでも回収しています(個人情報は消去)。${BATTERY}`,
    nuno: "収集日の午前8時までに、集落の決められた場所へ出します(品目ごとの案内に従います)。",
    binkan: "収集日の午前8時までに、集落の決められた場所へ出します。中を洗って出します(品目ごとの案内に従います)。",
    saibin: "収集日の午前8時までに、集落の決められた場所へ出します(品目ごとの案内に従います)。",
    pet: "収集日の午前8時までに、集落の決められた場所へ出します(品目ごとの案内に従います)。",
    pla: "収集日の午前8時までに、集落の決められた場所へ出します。はさみで切れる軟らかいプラスチックが対象で、硬いものは不燃ごみです(品目ごとの案内に従います)。",
    zasshi: "収集日の午前8時までに、集落の決められた場所へ出します。ひもで縛ります(品目ごとの案内に従います)。",
    danboru: "収集日の午前8時までに、集落の決められた場所へ出します。ひもで縛ります(品目ごとの案内に従います)。",
    pack: "収集日の午前8時までに、集落の決められた場所へ出します。中を洗い、乾燥させて切り開き、ひもで縛ります。",
    shinbun: "収集日の午前8時までに、集落の決められた場所へ出します。ひもで縛ります(品目ごとの案内に従います)。",
    kozasshi: "収集日の午前8時までに、集落の決められた場所へ出します(品目ごとの案内に従います)。",
  },
  itemNotes: {
    モバイルバッテリー: MOBILE_BATTERY,
    "パソコン・パソコンディスプレイ": PC,
    ノートパソコン: PC,
  },
}

const base = createStandardCsvAdapter(tottoriNanbuTownConfig)

export const tottoriNanbuTownAdapter: StandardCsvAdapter = {
  ...base,
  parse: (source) =>
    parseStandardCsv(tottoriNanbuTownConfig, toStandardCsv(source)),
}
