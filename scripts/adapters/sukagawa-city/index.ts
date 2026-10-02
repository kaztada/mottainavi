import {
  type StandardCsvConfig,
  createStandardCsvAdapter,
} from "../../core/standard-csv"

/**
 * 須賀川市「ゴミの分別方法一覧(自治体標準オープンデータセット)」(BODIK オープンデータ、CC BY 4.0、UTF-8 CSV)。
 * 国の標準形式だが、列名に接頭辞が無い(「品目」「分別区分」「注意点」…)ので headerPrefix は空文字。
 * 市のサイトの「家庭ごみ分別検索」と同じ内容(2026-10-03 に照合)。
 * 取得元の URL は data/municipalities/sukagawa-city/source.json。更新は BODIK の API で見張る(scripts/update-data.ts)。
 */
const BASE =
  "https://www.city.sukagawa.fukushima.jp/kurashi/gomi_recycle/gomi_katei/1002291/"
const GUIDE = BASE + "1008032/1002293.html" // ごみの正しい分け方と出し方

export const sukagawaCityConfig: StandardCsvConfig = {
  slug: "sukagawa-city",
  name: "須賀川市",
  watch: {
    kind: "ckan",
    api: "https://data.bodik.jp/api/3/action/package_show?id=072079_8865",
  },
  encoding: "utf-8",
  headerPrefix: "",
  expectedMinItems: 540,
  // 「資源物①」「資源物②」は正規化(NFKC)で「資源物1」「資源物2」になる
  labelToId: {
    可燃ごみ: "kanen",
    不燃ごみ: "funen",
    資源物1: "shigen1",
    資源物2: "shigen2",
    粗大ごみ: "sodai",
    収集不可: "fuka",
  },
  officialLink: {
    kanen: GUIDE,
    funen: GUIDE,
    shigen1: GUIDE,
    shigen2: GUIDE,
    sodai: BASE + "1002297.html",
    fuka: GUIDE,
  },
  notCollectedIds: ["fuka"],
  // 市のページ(粗大ごみの収集)の説明
  categoryNotes: {
    sodai:
      "おおむね60センチメートル以上のものです。事前予約制で、収集は無料です(環境課への電話か市公式LINE)。1回3点まで。長沼地域・岩瀬地域は、月1回のステーション収集(予約不要)もあります。",
  },
  // 市の資料どうしで案内が分かれている品目(2026-10-03 照合)
  itemNotes: {
    ボタン電池:
      "※もったいナビ注: 市の「ごみ分別一覧表」(令和7年度版)では「収集不可(販売店等のリサイクルボックスを利用)」と案内されています。市の分別検索と「ごみの正しい分け方と出し方」(2026年3月更新)では不燃ごみです。迷ったら市の環境課(0248-88-9129)にご確認ください。",
  },
}

export const sukagawaCityAdapter = createStandardCsvAdapter(sukagawaCityConfig)
