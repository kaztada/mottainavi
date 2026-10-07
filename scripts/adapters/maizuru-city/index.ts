import {
  type StandardCsvAdapter,
  type StandardCsvConfig,
  createStandardCsvAdapter,
  parseStandardCsv,
} from "../../core/standard-csv"
import { toStandardCsv } from "./convert"

/**
 * 舞鶴市「ゴミの分別方法一覧」(BODIK オープンデータ、CC BY 4.0、UTF-8 CSV、2026-03-30 版、115品目)。
 * 国の標準形式とほぼ同じだが見出しが少し違うので、標準形式の見出しに直してから(convert.ts)共通アダプタで読む。
 * 集積所に出せる区分の品目だけが入っていて、粗大ごみ・市が引き取らないごみの品目は無い。
 * 市の「令和8年度版舞鶴市ごみ分別ルールブック」の分別例一覧と照合済み(2026-10-08)。
 * 取得元の URL は data/municipalities/maizuru-city/source.json。更新は BODIK の API で見張る(scripts/update-data.ts)。
 */
const BASE = "https://www.city.maizuru.kyoto.jp/kurashi/"
const RULEBOOK = BASE + "0000014738.html" // 令和8年度版舞鶴市ごみ分別ルールブック
const FUNEN = BASE + "0000012922.html" // 不燃ごみの分別【7種9分別】について解説します
const LITHIUM = BASE + "0000014246.html" // 「リチウムイオン電池」内蔵の製品を、正しい方法で捨てましょう！

const RULEBOOK_NAME = "市の「ごみ分別ルールブック」(令和8年度版)"
const ASK = "迷ったら市のリサイクル事務所(0773-64-7222)にご確認ください。"

export const maizuruCityConfig: StandardCsvConfig = {
  slug: "maizuru-city",
  name: "舞鶴市",
  watch: {
    kind: "ckan",
    api: "https://data.bodik.jp/api/3/action/package_show?id=262021_garbage_separation",
  },
  encoding: "utf-8",
  headerPrefix: "",
  expectedMinItems: 105,
  // 「紙類（資源ごみ）」は正規化(NFKC)でかっこが半角になる。可燃ごみは、市のデータでは「可燃」
  labelToId: {
    可燃: "kanen",
    プラスチック容器包装類: "pla",
    ペットボトル: "pet",
    飲料用空缶類: "kan",
    食用びん類: "bin",
    金属類: "kinzoku",
    "紙類(資源ごみ)": "kami",
    埋立ごみ: "umetate",
    有害ごみ: "yugai",
  },
  officialLink: {
    kanen: RULEBOOK,
    pla: FUNEN,
    pet: FUNEN,
    kan: FUNEN,
    bin: FUNEN,
    kinzoku: FUNEN,
    kami: RULEBOOK,
    umetate: FUNEN,
    yugai: LITHIUM,
  },
  // 市のルールブック(月1回収集の不燃ごみ)と市のページ(使用済小型家電、リチウムイオン電池、7種9分別)の説明
  categoryNotes: {
    // 埋立ごみに電気製品が多い(掃除機・電気毛布など)のに、市のデータでは電池の注意が無い品目があるため
    umetate:
      "充電池や電池が本体から取り外せない小型家電(電気カミソリ、電子タバコ、モバイルバッテリーなど)は、埋立ごみではなく「有害ごみ」に出します。取り外せるものは、電池を外して本体を埋立ごみへ、外した電池は有害ごみへ。リチウムイオン電池を含む製品・ライター・スプレー缶が埋立ごみに混ざると、ごみ収集車やリサイクルプラザで発火するおそれがあります。",
    yugai:
      "集積所の「有害ごみ」の専用コンテナに出します。充電池・乾電池・ボタン電池は、袋に入れず裸のまま出します。",
  },
  // 市のデータと、市のルールブックの分別例一覧が食い違う品目(2026-10-08 照合)。市のデータは書き換えない
  itemNotes: {
    "ござ（燃える素材）": `※もったいナビ注: ${RULEBOOK_NAME}では「粗大ごみ(切って45リットルの可燃ごみ指定ごみ袋に入れれば、可燃ごみとして出せる)」と案内されています。最新は公式サイトでご確認ください。`,
    プリンター: `※もったいナビ注: ${RULEBOOK_NAME}では「用紙A3以下対応の家庭用インクジェットプリンターに限る」と案内されています。${ASK}`,
    "ハードディスク付属品（電池が取り外せないもの）": `※もったいナビ注: 市のデータには、この品目名で「埋立ごみ」と「有害ごみ」の2つの行があります。市の案内では、充電池や電池が本体から取り外せない小型家電は「有害ごみ」です。電池を取り外せるものは、電池を外して本体を埋立ごみへ、外した電池は有害ごみへ。${ASK}`,
  },
}

const base = createStandardCsvAdapter(maizuruCityConfig)

export const maizuruCityAdapter: StandardCsvAdapter = {
  ...base,
  parse: (source) => parseStandardCsv(maizuruCityConfig, toStandardCsv(source)),
}
