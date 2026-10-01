import {
  type StandardCsvConfig,
  createStandardCsvAdapter,
} from "../../core/standard-csv"

/**
 * 東大阪市「ゴミの分別方法一覧」(BODIK オープンデータ、CC BY 4.0、UTF-8 CSV)。
 * 国の標準形式なので共通アダプタ(scripts/core/standard-csv.ts)の設定だけを書く。
 * 市の品目IDは空欄のため、品目IDは共通パイプラインの id-map で品目名から採番する。
 * 取得元の URL は data/municipalities/higashiosaka-city/source.json。更新は BODIK の API で見張る(scripts/update-data.ts)。
 */
const BASE = "https://www.city.higashiosaka.lg.jp/"
const GUIDE = BASE + "0000030162.html" // ごみの分け方・出し方(保存版)

export const higashiosakaCityConfig: StandardCsvConfig = {
  slug: "higashiosaka-city",
  name: "東大阪市",
  watch: { kind: "ckan", api: "https://data.bodik.jp/api/3/action/package_show?id=272272_28" },
  encoding: "utf-8",
  headerPrefix: "ゴミの分別方法_",
  expectedMinItems: 850,
  // 表記ゆれ(「かんびん」「家庭ごみ(もえるもの）」等)はここで吸収する
  labelToId: {
    "家庭ごみ(もえる物)": "katei",
    "家庭ごみ(もえるもの)": "katei",
    "不燃の小物(もえない小物)": "funen",
    "不燃の小物(燃えないごみ)": "funen",
    "あきかん・あきびん": "kan-bin",
    かんびん: "kan-bin",
    プラスチック製容器包装: "plastic",
    ペットボトル: "pet",
    大型ごみ: "ogata",
    小型家電回収ボックス: "kogata-box",
    地域の集団回収へ: "shudan",
    拠点回収: "kyoten",
    回収協力店: "kyoryokuten",
    JBRCの回収協力店の回収BOXへ: "kyoryokuten",
    電池工業会の回収BOXへ: "kyoryokuten",
    不可: "fuka",
    在宅医療廃棄物収集: "kobetsu",
    "電話申込・持ち込み": "kobetsu",
  },
  officialLink: {
    katei: GUIDE,
    funen: BASE + "0000035308.html",
    "kan-bin": GUIDE,
    plastic: BASE + "0000000180.html",
    pet: BASE + "0000000180.html",
    ogata: BASE + "0000023472.html",
    "kogata-box": BASE + "0000012601.html",
    shudan: GUIDE,
    kyoten: BASE + "0000010406.html",
    kyoryokuten: BASE + "0000010406.html",
    fuka: GUIDE,
    kobetsu: GUIDE,
  },
  notCollectedIds: ["fuka"],
  // これ以外で区分名と違う表記(回収協力店の種類・個別指示)は「出し方: …。」として残す
  sameAsCategory: new Set([
    "家庭ごみ(もえる物)",
    "家庭ごみ(もえるもの)",
    "不燃の小物(もえない小物)",
    "不燃の小物(燃えないごみ)",
    "あきかん・あきびん",
    "かんびん",
    "プラスチック製容器包装",
    "ペットボトル",
    "大型ごみ",
    "小型家電回収ボックス",
    "地域の集団回収へ",
    "拠点回収",
    "不可",
  ]),
}

export const higashiosakaCityAdapter = createStandardCsvAdapter(
  higashiosakaCityConfig
)
