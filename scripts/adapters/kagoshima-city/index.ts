import {
  type StandardCsvConfig,
  createStandardCsvAdapter,
} from "../../core/standard-csv"

/**
 * 鹿児島市「ごみの分別一覧」(BODIK オープンデータ、鹿児島市オープンデータ利用規約で CC BY 4.0)。
 * 国の標準形式なので共通アダプタ(scripts/core/standard-csv.ts)の設定だけを書く。原本は CP932。
 * 「備考」「料金備考」の列にも出し方の注意(粗大ごみの申込先、持ち込み時の事前連絡など)があるので注意文言に足す。
 * 更新時は BODIK のデータセット(462012_gomibunbetsu)で新しい CSV の URL を確認して sourceUrl を差し替える。
 */
const BASE =
  "https://www.city.kagoshima.lg.jp/shigenseisaku/gomi/kate/dashikata/wakekata/"
const DENKYU = BASE + "denkyu.html" // 電球・蛍光灯/乾電池/小型充電式電池等/スプレー缶類
const NOT_COLLECTED =
  "https://www.city.kagoshima.lg.jp/kurashi/gomi/kate/dashikata/dekinaimono/index.html"

export const kagoshimaCityConfig: StandardCsvConfig = {
  slug: "kagoshima-city",
  name: "鹿児島市",
  sourceUrl:
    "https://data.bodik.jp/dataset/14ee85c1-1782-413c-a7b7-229b4ecaa4ab/resource/fd68910d-5734-4cbb-b229-e673f6aa18e9/download/3-43_gomibunbetsu.csv",
  encoding: "shift_jis",
  headerPrefix: "ゴミの分別方法_",
  expectedMinItems: 1100,
  labelToId: {
    もやせるごみ: "moyaseru",
    もやせないごみ: "moyasenai",
    金属類: "kinzoku",
    "缶・びん": "kan-bin",
    ペットボトル: "pet",
    "電球・蛍光灯": "denkyu",
    プラ容器類: "pla",
    "古紙(雑紙)": "koshi",
    "古紙(紙パック)": "koshi",
    "古紙(新聞)": "koshi",
    "古紙(段ボール)": "koshi",
    衣類: "irui",
    乾電池: "kandenchi",
    小型充電式電池等: "juden",
    スプレー缶類: "spray",
    粗大ごみ: "sodai",
    小型家電: "kogata",
    剪定枝: "sentei",
    "※資源政策課等へ持ち込みを": "mochikomi",
    リサイクル家電: "kaden",
    "収集・受入しない": "fuka",
    収集しない: "fuka",
  },
  officialLink: {
    moyaseru: BASE + "moyaseru.html",
    moyasenai: BASE + "moyasenai.html",
    kinzoku: BASE + "kinzokurui.html",
    "kan-bin": BASE + "kan.html",
    pet: BASE + "kan.html",
    denkyu: DENKYU,
    pla: BASE + "plastic.html",
    koshi: BASE + "koshi.html",
    irui: BASE + "koshi.html",
    kandenchi: DENKYU,
    juden: DENKYU,
    spray: DENKYU,
    sodai: BASE + "sodaigomi.html",
    kogata: BASE + "kogatakaden.html",
    sentei: "https://www.city.kagoshima.lg.jp/recycle/senteishikokuchi.html",
    mochikomi: BASE + "sakuin.html",
    kaden: NOT_COLLECTED,
    fuka: NOT_COLLECTED,
  },
  notCollectedIds: ["kaden", "fuka"],
  // 市のページ(粗大ごみ)の説明
  categoryNotes: {
    sodai:
      "事前申込制です(有料。品目により350円または700円)。申込みは1世帯1回5点まで。",
  },
  // 古紙の種類(雑紙・紙パック・新聞・段ボール)だけ「出し方: …。」として残す
  sameAsCategory: new Set([
    "もやせるごみ",
    "もやせないごみ",
    "金属類",
    "缶・びん",
    "ペットボトル",
    "電球・蛍光灯",
    "プラ容器類",
    "衣類",
    "乾電池",
    "小型充電式電池等",
    "スプレー缶類",
    "粗大ごみ",
    "小型家電",
    "剪定枝",
    "※資源政策課等へ持ち込みを",
    "リサイクル家電",
    "収集・受入しない",
    "収集しない",
  ]),
  // 「金属類/小型家電」「小型充電式電池等/小型家電」などを2枚のカードに分ける
  labelSeparator: "/",
  fullWidthKana: true,
  extraNoteColumns: ["料金備考", "備考"],
  // 市の冊子「ごみ分別辞典」・市のページ(プラスチック容器類)とデータが食い違う品目(2026-10-02 照合)
  itemNotes: {
    "化粧品の容器<プラ製>":
      "※もったいナビ注: 市のページと分別辞典(冊子)では「プラスチック容器類」と案内されています。市のデータ(この表示の区分)と食い違うため、最新は公式サイトでご確認ください。",
  },
}

export const kagoshimaCityAdapter = createStandardCsvAdapter(kagoshimaCityConfig)
