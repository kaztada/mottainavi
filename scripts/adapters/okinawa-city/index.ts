import {
  type StandardCsvConfig,
  createStandardCsvAdapter,
} from "../../core/standard-csv"

/**
 * 沖縄市「ごみの分別方法一覧」(BODIK オープンデータ、沖縄市オープンデータ利用規約で CC BY 4.0、UTF-8 CSV)。
 * 国の標準形式なので共通アダプタ(scripts/core/standard-csv.ts)の設定だけを書く。
 * 市は版ごとに新しいファイルをデータセットに足す(例: ごみの分別方法一覧_2026-02-26)。
 * 取得元の URL は data/municipalities/okinawa-city/source.json。更新は BODIK の API で見張る(scripts/update-data.ts)。
 */
const BASE = "https://www.city.okinawa.okinawa.jp/kurashi/gomi/gomikensaku/"
const KANKYOKA = "迷ったら市の環境課(098-939-1212)にご確認ください。"
const mismatch = (siteLabel: string) =>
  `※もったいナビ注: 市のサイトの検索ページでは「${siteLabel}」と案内されています。市のデータ(この表示の区分)と食い違うため、${KANKYOKA}`

export const okinawaCityConfig: StandardCsvConfig = {
  slug: "okinawa-city",
  name: "沖縄市",
  watch: {
    kind: "ckan",
    api: "https://data.bodik.jp/api/3/action/package_show?id=472115_separate_garbage_20241201",
  },
  encoding: "utf-8",
  headerPrefix: "ゴミの分別方法_",
  expectedMinItems: 700,
  labelToId: {
    もやせる: "moyaseru",
    もやせるごみ: "moyaseru",
    もやせない: "moyasenai",
    もやせないごみ: "moyasenai",
    "資源ごみ(紙)": "kami",
    "資源ごみ(びん)": "bin",
    "資源ごみ(かん)": "kan",
    "資源ごみ(ペットボトル)": "pet",
    "資源ごみ(草木)": "kusaki",
    有害ごみ: "yugai",
    粗大ごみ: "sodai",
    収集しません: "fuka",
  },
  officialLink: {
    moyaseru: BASE + "moyaseru.html",
    moyasenai: BASE + "moyasenai.html",
    kami: BASE + "kami.html",
    bin: BASE + "bin.html",
    kan: BASE + "kan.html",
    pet: BASE + "petbottle.html",
    kusaki: BASE + "kusaki.html",
    yugai: BASE + "yuugaigomi.html",
    sodai: BASE + "sodaigomi.html",
    fuka: BASE + "shuushuushinai.html",
  },
  notCollectedIds: ["fuka"],
  // 市のページ(有害ごみ、粗大ごみ、草木類)の説明
  categoryNotes: {
    yugai:
      "種類別に透明袋に入れ、口をしばって出します。電池は電極にテープを貼って絶縁し、充電式電池と使い捨て電池は袋を分けてください。",
    sodai:
      "事前申込制です(オンラインまたは電話)。粗大ごみ処理券(1枚300円)が必要です。1回の受付で8点まで。",
    kusaki:
      "袋または束あわせて6点まで回収します(7点以上は電話での申込みが必要です)。",
  },
  // 市のサイトの「ごみ分別50音一覧」とデータが食い違う品目(2026-10-02 照合。サイト側のページは2022〜2024年のもの)
  itemNotes: {
    加熱式タバコ: `※もったいナビ注: 市のサイトの検索ページ(2022年)では「収集しません」と案内されています。市は2025年4月から、充電式電池と、電池を取り外せない機器を「有害ごみ」で収集しています。${KANKYOKA}`,
    粘着カーペットクリーナー: mismatch("もやせない"),
    便座: mismatch("もやせる"),
    "ホイールキャップ（カバー）": mismatch("収集しません"),
  },
}

export const okinawaCityAdapter = createStandardCsvAdapter(okinawaCityConfig)
