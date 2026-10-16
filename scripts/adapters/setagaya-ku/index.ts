import {
  NOT_COLLECTED_NOTE,
  type StandardCsvAdapter,
  type StandardCsvConfig,
  createStandardCsvAdapter,
  parseStandardCsv,
} from "../../core/standard-csv"
import type { RawItem } from "../../core/types"
import { LABEL_SEPARATOR, toStandardCsv } from "./convert"

/**
 * 世田谷区「ごみ分別一覧」(自治体標準オープンデータセット、区のサイトに掲載、CC BY 4.0、UTF-8 CSV、
 * 令和8年(2026年)3月作成、787品目)。東京都オープンデータカタログにも登録されている。
 * 見出しは標準形式だが「品目」と「分別区分」の列が全行で入れ替わり、注意書きは「備考」にあるので、
 * convert.ts で直してから共通アダプタで読む。
 * 区の「資源・ごみの分別(50音順)」(166品目、2026-07)と照合済み(2026-10-16。危険物の区分の食い違い0件)。
 * 区のサイトの文章は二次利用できない(オープンデータの CSV だけが CC BY)ので、区分の説明・注記は
 * 区のページの文章を写さず、事実を自分の言葉で書く。
 * 取得元の URL は data/municipalities/setagaya-ku/source.json。更新は区のオープンデータのページのリンクで見張る。
 */
const BASE = "https://www.city.setagaya.lg.jp/"
const DASHIKATA = BASE + "02241/387.html" // ごみの出し方
const SHIGEN = BASE + "02241/396.html" // 資源の出し方
const SODAI = BASE + "02241/online_tetsuzuki/380.html" // 粗大ごみの出し方
const KOGATA = BASE + "02241/403.html" // 使用済み小型家電などの回収
const DENCHI = BASE + "02241/394.html" // 電池の処分方法

/** 管轄の清掃事務所(区のページ「ガスボンベ・スプレー缶などの危険なごみ…」より) */
const SEISO =
  "管轄の清掃事務所(世田谷・北沢地域は世田谷清掃事務所 03-3425-3111、玉川地域は玉川清掃事務所 03-3703-2638、砧・烏山地域は砧清掃事務所 03-3290-2151)"

/** 区の案内(使用済み小型家電などの回収)で、回収ボックスの対象12品目にあたる品目。データの備考は「できるだけ回収ボックスへ」 */
const KOGATA_BOX_ITEMS = [
  "スマートフォン",
  "デジタルカメラ",
  "電卓",
  "電話機（子機）",
  "延長コード",
  "ACアダプター",
  "コード類（電気コード）",
  "ビデオカメラ",
]
const KOGATA_BOX =
  "※もったいナビ注: 使用済小型家電の回収ボックスは区内12か所(区役所・総合支所・まちづくりセンター・エコプラザ用賀・リサイクル千歳台など)にあります。個人情報のデータは自分で消してから入れます。取り外せる充電式電池は入れられません(不燃ごみの日に別の袋で)。コード類は結んでから入れます。"

/** 区では収集しないもの(コアの文言は「市」なので、この区の品目だけ「区」に直す) */
const NOT_COLLECTED_NOTE_KU = "区では収集しません。"

export const setagayaKuConfig: StandardCsvConfig = {
  slug: "setagaya-ku",
  name: "世田谷区",
  watch: {
    kind: "page-link",
    pageUrl: BASE + "opendata/22308.html",
    linkText: /ごみ分別一覧/,
  },
  encoding: "utf-8",
  headerPrefix: "",
  expectedMinItems: 700,
  labelSeparator: LABEL_SEPARATOR,
  labelToId: {
    可燃ごみ: "kanen",
    不燃ごみ: "funen",
    粗大ごみ: "sodai",
    資源: "shigen",
    拠点回収: "kyoten",
    "店頭・拠点回収": "kyoten",
    店頭回収: "kyoten",
    地域の古着回収: "kyoten",
    "販売店又は小型家電回収ボックスへ。回収場所が近くにないときは、不燃ごみへ":
      "kogata",
    販売店の回収ボックスへ: "hanbaiten",
    区では収集できないもの: "fuka",
    区では回収できないもの: "fuka",
  },
  // 区分名と同じ意味の表記。ほかの表記(店頭回収・古着回収・回収ボックスの案内など)は「出し方: …」で残す
  sameAsCategory: new Set([
    "可燃ごみ",
    "不燃ごみ",
    "粗大ごみ",
    "資源",
    "拠点回収",
    "区では収集できないもの",
    "区では回収できないもの",
  ]),
  officialLink: {
    kanen: DASHIKATA,
    funen: DASHIKATA,
    sodai: SODAI,
    shigen: SHIGEN,
    kyoten: SHIGEN,
    kogata: KOGATA,
    hanbaiten: DENCHI,
    fuka: DASHIKATA,
  },
  notCollectedIds: ["fuka"],
  categoryNotes: {
    kanen:
      "収集日(週2回)の朝8時までに、ふたつきの容器か中身の見える袋に入れて出します。充電式電池や、電池が内蔵された製品は入れないでください(不燃ごみの日に別の袋で)。",
    // 区の「ごみの出し方」「充電式電池は不燃ごみの日に」「電池の処分方法」「ガスボンベ・スプレー缶など」のページの事実を自分の言葉で
    funen: `月2回の不燃ごみの日に出します。最も長い辺が30cmを超えるものは粗大ごみです。充電式電池(リチウムイオン電池など)と、それが内蔵された製品(スマートフォン・モバイルバッテリー・ワイヤレスイヤホン・電動歯ブラシなど)は、電池を使い切って端子やコードの差込口をテープで覆い、ほかの不燃ごみとは別の袋に入れて「充電式電池」と書いて出します。製品から電池を無理に取り外さないでください。膨張・変形したものは集積所に出さず、清掃事務所・エコプラザ用賀・リサイクル千歳台などの窓口に持ち込みます。乾電池・コイン型電池は両極にテープを貼ってから出します。スプレー缶・カセットボンベ・ライターは中身を使い切り(穴はあけない)、ほかの不燃ごみとは別の袋に入れて「スプレー缶」などと表示します(使い切れないときは「中身あり」と書き添える)。割れたガラスや刃物は厚紙などで包んで「キケン」と表示します。迷ったら${SEISO}へ。`,
    sodai:
      "事前申込制で有料です。粗大ごみ受付センター(インターネット https://www.sodai-setagaya.jp/ 、電話 03-5715-1133)に申し込み、有料粗大ごみ処理券を貼るか、オンライン決済で手数料を払って出します。申込みの無い粗大ごみは収集されません。最も長い辺が30cm以上のもの(布団・いす・カーペット・家具・自転車など)が対象です。",
    shigen:
      "週1回の資源の日に出します。品目ごとの案内に従って、洗う・ひもでしばるなどしてから出します。",
    // 回収場所は品目ごとに違う(小型家電の回収ボックス・水銀製品の回収施設・食用油の回収日など)ので、ここでは決めつけない
    kyoten:
      "区の施設やお店などの回収場所に持って行く方法です。回収場所と対象は品目ごとに違うので、品目ごとの案内と区の公式サイトを確かめてください。",
    kogata:
      "使用済小型家電の回収ボックス(区内12か所)か、販売店の回収に出します。個人情報のデータは自分で消してから。携帯電話は携帯電話会社のショップでも回収しています。",
    hanbaiten:
      "区では収集しません。ボタン電池回収協力店の回収缶に入れるか、販売店に相談してください。",
  },
  // 区の「資源・ごみの分別(50音順)」(2026-07)とデータが違う品目(2026-10-16 照合)。データは書き換えない
  itemNotes: {
    ...Object.fromEntries(KOGATA_BOX_ITEMS.map((name) => [name, KOGATA_BOX])),
    薬びん:
      "※もったいナビ注: 区の「資源・ごみの分別(50音順)」では、薬びんは「資源」(農薬や劇薬のびんは不燃ごみ)と案内されています。最新は区の公式サイトでご確認ください。",
    "ホイール（タイヤ用）": `※もったいナビ注: 区の「資源・ごみの分別(50音順)」では、ホイールの付いたタイヤは区では収集せず、販売店などに相談するよう案内されています。ホイールだけを粗大ごみに出せるかは、${SEISO}にご確認ください。`,
  },
}

/** 収集しない区分の品目の「市では収集しません。」を「区では収集しません。」にする */
function toWard(items: RawItem[]): RawItem[] {
  return items.map((item) => ({
    ...item,
    rows: item.rows.map((row) => ({
      ...row,
      note:
        row.note?.replace(NOT_COLLECTED_NOTE, NOT_COLLECTED_NOTE_KU) ?? null,
    })),
  }))
}

const base = createStandardCsvAdapter(setagayaKuConfig)
const knownLabels = new Set(Object.keys(setagayaKuConfig.labelToId))

export const setagayaKuAdapter: StandardCsvAdapter = {
  ...base,
  parse: (source) =>
    toWard(
      parseStandardCsv(setagayaKuConfig, toStandardCsv(source, knownLabels))
    ),
}
