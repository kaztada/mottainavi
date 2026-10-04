import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fetchBinaryWithCache } from "../../core/fetch-cache"
import { CACHE_DIR } from "../../core/paths"
import { readSource } from "../../core/source"
import {
  type StandardCsvAdapter,
  type StandardCsvConfig,
  createStandardCsvAdapter,
  parseStandardCsv,
} from "../../core/standard-csv"
import { xlsxToStandardCsv } from "./convert"

/**
 * 福岡市「ごみの分け方(品目)検索」(BODIK オープンデータ、福岡市オープンデータ利用規約で CC BY 4.0、Excel)。
 * 国の標準形式の5列だが、Excel で、注意点に HTML が混ざる。変換(convert.ts)で標準形式の CSV にしてから
 * 共通アダプタで読む。令和6年度版(2024-09-25)。市の公式の分別検索サイトと全件照合済み(2026-10-04)。
 * 取得元の URL は data/municipalities/fukuoka-city/source.json。更新は BODIK の API で見張る(scripts/update-data.ts)。
 */
const SITE = "https://kateigomi-bunbetsu.city.fukuoka.lg.jp/rule/"
const RULES =
  "https://www.city.fukuoka.lg.jp/kankyo/jigyokeigomi/life/katei-bunbetsu/"

/** 市の「充電式電池を含む小型電子機器はごみ袋で出さないでください」(2025-12-13 更新)などの内容 */
const BATTERY_FUNEN =
  "充電式電池が内蔵された製品(コードレス掃除機・スマホ・ワイヤレスイヤホンなど)は、必ず電池を取り外してから出してください(外した電池は端子にテープを貼って資源物回収ボックスなどへ)。電池を取り外せないものは、無理に分解せず、燃えないごみの袋ではなく本体ごと小型電子機器回収ボックス(投入口は横25cm×縦8.5cm)へ。大きいものは家電量販店の回収か宅配回収(有料)を利用します。液漏れの恐れがあるときはビニール袋に入れ、膨張・液漏れ・破損のある充電式電池は資源物回収ボックスのみで受け付けます(ボックスのスタッフに声をかけてください)。割れたもの・割れやすいものは、厚い紙で包んで「危険」と表示してください。"
const BATTERY_TAPE =
  "安全のため、必ず両極にテープを貼り、絶縁して出してください。"
const BATTERY_FUKA =
  "端子にテープを貼って絶縁してから出してください。無理に分解せず、機器ごと持ち込みます。液漏れの恐れがあるときはビニール袋に入れ、膨張・液漏れ・破損があるものは資源物回収ボックスのみで受け付けます(ボックスのスタッフに声をかけてください)。"
const NOTE_PREFIX = "※もったいナビ注: "
const NOTE_SUFFIX = "最新は市の公式サイトでご確認ください。"

export const fukuokaCityConfig: StandardCsvConfig = {
  slug: "fukuoka-city",
  name: "福岡市",
  watch: {
    kind: "ckan",
    api: "https://data.bodik.jp/api/3/action/package_show?id=401307_disposing-method",
    format: "XLSX",
  },
  // 変換後の CSV は UTF-8
  encoding: "utf-8",
  headerPrefix: "ゴミの分別方法_",
  expectedMinItems: 560,
  // 区分が空の品目(犬猫の死体・FRP船・注射針)は、市の案内文だけがある個別の案内
  labelToId: {
    燃えるごみ: "kanen",
    燃えないごみ: "funen",
    粗大ごみ: "sodai",
    小型家電: "kogata",
    古紙: "koshi",
    "空きびん・ペットボトル": "bin-pet",
    市で収集しないごみ: "fuka",
    家電リサイクル法対象品: "kaden",
    パソコン: "pasokon",
    "": "kobetsu",
  },
  officialLink: {
    kanen: SITE + "burnableGarbage",
    funen: SITE + "unburnableGarbage",
    sodai: SITE + "coarseDust",
    kogata: SITE + "consumerElectronics",
    koshi: SITE + "wastePaper",
    "bin-pet": SITE + "bottles",
    fuka: SITE + "collect",
    kaden: SITE + "recyclingLaw",
    pasokon: SITE + "personalComputer",
    kobetsu: RULES + "syushusinai-gomi.html",
  },
  notCollectedIds: ["fuka", "kaden", "pasokon"],
  // 市のページ(燃えないごみの出し方、充電式電池を含む小型電子機器、粗大ごみの出し方、パソコン)の説明
  categoryNotes: {
    funen: BATTERY_FUNEN,
    kogata:
      "個人情報は消し、取り外せる電池は外してください(外した電池やモバイルバッテリーは、回収ボックス横の小型充電式電池回収ペール缶へ)。充電式電池を取り外せない機器は、無理に分解せず、本体ごと回収ボックスへ。投入口に入らない大きさでも、充電式電池を取り外せない機器は、燃えないごみの袋では出せません(家電量販店の回収か宅配回収を利用)。下の「入らない大きさのものは燃えないごみへ」という市の案内は、充電式電池が残っていないものに限ります。液漏れの恐れがあるときはビニール袋に入れ、膨張・液漏れ・破損のある充電式電池は資源物回収ボックスのみで受け付けます(ボックスのスタッフに声をかけてください)。",
    sodai:
      "事前の申込みが必要です(電話・インターネット・LINE)。粗大ごみ処理券(300円・500円・1,000円。コンビニなどで購入)に受付番号か名前を書いて貼り(LINE受付でオンライン決済をしたときは、処理券の代わりに受付番号・収集日・金額を書いた紙を貼ります)、収集日の朝8時30分までに、指定された場所に出します。品目ごとの案内があればそれに従ってください(袋に入って口が結べる大きさのものは、燃えないごみ・燃えるごみで出せるとされている品目があります)。",
    pasokon:
      "パソコンは、市では収集せず、処理施設にも持ち込めません。メーカーに回収を申し込むか(PCリサイクルマークが付いたものは無料)、宅配回収(リネットジャパンリサイクル。パソコン本体を含めば1箱分は無料)を利用します。",
  },
  // 市の公式の分別検索サイトと市の最新のページに、データより詳しい・新しい案内があるもの(2026-10-04 照合)
  itemNotes: {
    掃除機: `${NOTE_PREFIX}コードレス掃除機・ロボット掃除機は、充電式電池を取り外してから出してください(市の「燃えないごみの出し方」2026年6月更新)。電池を取り外せないものは、燃えないごみの袋では出せません。家電量販店の回収か、宅配回収(有料)を利用します。${NOTE_SUFFIX}`,
    "ヘッドホン・イヤホン": `${NOTE_PREFIX}ワイヤレスのものは充電式電池を含むため、ごみ袋では出せません。小型電子機器回収ボックスへ(市の分別検索より)。${NOTE_SUFFIX}`,
    ボタン型電池: `${NOTE_PREFIX}市で収集しないのは、型式が SR・LR・PR で始まるボタン型電池です(市の分別検索より)。SR・LR・PR 型は、絶縁のためテープを貼って、資源物回収ボックスや家電量販店などの回収ボックスへ持ち込みます。CR・BR で始まるコイン型電池は燃えないごみで、両極にテープを貼って絶縁して出します。${NOTE_SUFFIX}`,
    乾電池: `${NOTE_PREFIX}${BATTERY_TAPE}(市の「燃えないごみの出し方」より)`,
    コイン型電池: `${NOTE_PREFIX}${BATTERY_TAPE}(市の「燃えないごみの出し方」より)`,
    リチウム一次電池: `${NOTE_PREFIX}${BATTERY_TAPE}(市の「燃えないごみの出し方」より)`,
    充電式電池: `${NOTE_PREFIX}${BATTERY_FUKA}(市の「充電式電池を含む小型電子機器はごみ袋で出さないでください」より)`,
    モバイルバッテリー: `${NOTE_PREFIX}${BATTERY_FUKA}(市の「充電式電池を含む小型電子機器はごみ袋で出さないでください」より)`,
    "リチウムイオン電池（充電式）": `${NOTE_PREFIX}${BATTERY_FUKA}(市の「充電式電池を含む小型電子機器はごみ袋で出さないでください」より)`,
    ニカド電池: `${NOTE_PREFIX}${BATTERY_FUKA}(市の「充電式電池を含む小型電子機器はごみ袋で出さないでください」より)`,
    ニッケル水素電池: `${NOTE_PREFIX}${BATTERY_FUKA}(市の「充電式電池を含む小型電子機器はごみ袋で出さないでください」より)`,
    加熱式たばこ: `${NOTE_PREFIX}充電式電池を含むため、機器本体ごと、資源物回収ボックスや小型充電式電池回収ペール缶などでも回収しています。${BATTERY_FUKA}(市の「充電式電池を含む小型電子機器はごみ袋で出さないでください」より)`,
    電子たばこ: `${NOTE_PREFIX}充電式電池を含むため、機器本体ごと、資源物回収ボックスや小型充電式電池回収ペール缶などでも回収しています。${BATTERY_FUKA}(市の「充電式電池を含む小型電子機器はごみ袋で出さないでください」より)`,
    使い捨てライター: `${NOTE_PREFIX}ガスは、火気のない風通しのよい場所で出し切ってください(スプレー缶などについての市の案内と同じ)。市の分別検索では「レバーを下げた状態にしてゴムで固定する」と案内されています。${NOTE_SUFFIX}`,
    使い捨てカイロ: `${NOTE_PREFIX}未使用の場合は、一度開封して放熱させ、冷ましてから出してください(市の「燃えないごみの出し方」より)。`,
    石油ストーブ: `${NOTE_PREFIX}市の分別検索では「必ず灯油を抜いて、乾電池をはずして出す」と案内されています。${NOTE_SUFFIX}`,
    オイル缶: `${NOTE_PREFIX}市の分別検索では「オイルは布や紙に染み込ませて燃えるごみへ」と案内されています。${NOTE_SUFFIX}`,
  },
}

const base = createStandardCsvAdapter(fukuokaCityConfig)
const XLSX_CACHE = join(CACHE_DIR, "fukuoka-city.xlsx")
const CSV_CACHE = join(CACHE_DIR, "fukuoka-city.csv")

export const fukuokaCityAdapter: StandardCsvAdapter = {
  ...base,
  async fetchSource({ refresh }) {
    const { data, fromCache } = await fetchBinaryWithCache(
      readSource("fukuoka-city").file_url,
      XLSX_CACHE,
      refresh
    )
    const source = await xlsxToStandardCsv(data)
    await writeFile(CSV_CACHE, source, "utf-8")
    return { source, fromCache, location: XLSX_CACHE }
  },
  parse: (source) => parseStandardCsv(fukuokaCityConfig, source),
}
