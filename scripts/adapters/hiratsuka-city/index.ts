import {
  type StandardCsvConfig,
  createStandardCsvAdapter,
} from "../../core/standard-csv"

/**
 * 平塚市「ごみの分別方法一覧」(平塚市オープンデータライブラリ、CC BY 4.0)。
 * 国の標準形式なので共通アダプタ(scripts/core/standard-csv.ts)の設定だけを書く。原本は CP932。
 * 市の品目ID(ff0000000001 等)は連番のため使わず、品目IDは共通パイプラインの id-map で品目名から採番する。
 * 取得元の URL は data/municipalities/hiratsuka-city/source.json。更新は「暮らし・防災・安全に関するデータセット」のページのリンクで見張る(scripts/update-data.ts)。
 */
const BASE = "https://www.city.hiratsuka.kanagawa.jp/kankyo/"
const GUIDE = BASE + "page-c_01152.html" // 家庭のごみ・資源の分け方・出し方

export const hiratsukaCityConfig: StandardCsvConfig = {
  slug: "hiratsuka-city",
  name: "平塚市",
  watch: {
    kind: "page-link",
    pageUrl: "https://www.city.hiratsuka.kanagawa.jp/keikaku/page81_00019.html",
    linkText: /ごみの分別方法一覧.*CSV/,
  },
  encoding: "shift_jis",
  headerPrefix: "ごみの分別方法_",
  expectedMinItems: 780,
  // 表記ゆれ(「金属（資源再生物）」と「金属(資源再生物)」、半角カナの「ﾘｻｲｸﾙ」等)は正規化で吸収される
  labelToId: {
    可燃ごみ: "kanen",
    不燃ごみ: "funen",
    有害ごみ: "yugai",
    "金属(資源再生物)": "kinzoku",
    "空き缶類(資源再生物)": "akikan",
    "ビン(資源再生物)": "bin",
    "廃食用油(資源再生物)": "haiyu",
    ペットボトル: "pet",
    "古紙類(資源再生物)": "koshi",
    "布類(資源再生物)": "nuno",
    容器包装プラスチック: "pla",
    粗大ごみ: "sodai",
    小型家電: "kogata",
    リサイクル: "recycle",
    剪定枝: "sentei",
    家電リサイクル: "kaden",
    処理困難物: "konnan",
    産業廃棄物: "sangyo",
  },
  officialLink: {
    kanen: GUIDE,
    funen: GUIDE,
    yugai: GUIDE,
    kinzoku: GUIDE,
    akikan: GUIDE,
    bin: GUIDE,
    haiyu: GUIDE,
    pet: BASE + "page-c_01166.html",
    koshi: GUIDE,
    nuno: GUIDE,
    pla: BASE + "page-c_01156.html",
    sodai: BASE + "page-c_01174.html",
    kogata: BASE + "page-c_01216.html",
    recycle: GUIDE,
    sentei: BASE + "page-c_01229.html",
    kaden: BASE + "page-c_01169.html",
    konnan: GUIDE,
    sangyo: GUIDE,
  },
  notCollectedIds: ["kaden", "konnan", "sangyo"],
  // 市のページ(粗大ごみ回収の申込み)の説明
  categoryNotes: {
    sodai: "事前予約制の各戸収集です(有料。原則1立方メートルにつき3,500円)。",
  },
  // 「不燃ごみ又は処理困難物」(珪藻土バスマット)を2枚のカードに分ける
  labelSeparator: "又は",
  fullWidthKana: true,
}

export const hiratsukaCityAdapter = createStandardCsvAdapter(hiratsukaCityConfig)
