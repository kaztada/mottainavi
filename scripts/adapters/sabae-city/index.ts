import {
  type StandardCsvAdapter,
  type StandardCsvConfig,
  createStandardCsvAdapter,
  parseStandardCsv,
} from "../../core/standard-csv"
import {
  type ConvertOptions,
  LABEL_JOINER,
  toStandardCsv,
} from "../fukui-city/convert"

/**
 * 鯖江市。福井県「ごみ分別一覧」の鯖江市の CSV(県内の市町の共同公開、CC BY 4.0、UTF-8、967行)。
 * 県の掲載日は 2026-09-16。市の「50音別ごみ分別早見表」(令和8年10月1日更新)と照合済み(2026-10-23。
 * 品名が見つかった801品目のうち800が区分一致、危険物は全部一致)。福井市と同じ県の共通8列なので、
 * 福井市の変換(fukui-city/convert.ts)を市の設定で使う。原本には見出しの無い9列目(全行空。書き損じの1行を除く)がある。
 * 「小型家電（15cm×30cmのもの）燃えないごみ」のように2つの出し先が1つの表記に入る区分は、2枚のカードに分ける。
 * 市のサイト本体はオープンデータではないので、区分の説明・注記は市のページの事実を自分の言葉で書いた。
 * 取得元の URL は data/municipalities/sabae-city/source.json。更新は CSV の中身のハッシュで見張る。
 */
const GOMI = "https://www.city.sabae.fukui.jp/kurashi_tetsuduki/gomi_risaikuru/"
const BUNBETSU = GOMI + "kateigomi/gominobunbetsu.html" // 家庭ごみの分別表(2026-10-02)。50音別ごみ分別早見表(令和8年10月1日更新)もここから
const KOGATA = GOMI + "kateigomi/kogatakadenkaishu.html" // 使用済小型家電を回収しています(2025-08-29)
const JUDEN = GOMI + "oshirase/Kankyo0105.html" // リチウムイオン電池などの充電式電池の捨て方(2026-01-21)
const SYORI = GOMI + "kateigomi/syorisuruhouhou.html" // 多量のごみや大型ごみを専門業者へ依頼(業者は2025-08-01現在)

const NOTE = "※もったいナビ注: "

/** 充電式の電池と、それを内蔵した製品(市の充電式電池のページ 2026-01-21・小型充電式電池のページ 2026-10-01) */
const BATTERY =
  "電池で動くものは、電池を外してから出します。充電式の電池(リチウムイオン電池など)と、それを内蔵した製品(スマートフォン・モバイルバッテリー・ハンディファン・電子たばこ・電動歯ブラシ・ワイヤレスイヤホンなど)は、燃えないごみや大型ごみに入れず、資源物の収集日に町内のごみステーションのオレンジ色の「充電式電池を含む製品」ボックスへ入れます(膨張したものも可)。回収協力店(膨張・破損したものは不可)や、鯖江クリーンセンターへの直接の持込み(膨張したものも可)でも出せます。無理に分解しないでください。電池だけ(ニカド・ニッケル水素・リチウムイオン)を電気店などのリサイクル協力店の回収ボックスに出すときは、金属端子をテープで絶縁します(リサイクルマークのある小型充電式電池が対象。膨張・破損した電池、水にぬれた電池、メーカーが分からない電池、外装の無いラミネート型の電池は協力店に出せないので、「充電式電池を含む製品」ボックスかクリーンセンターへ)。乾電池・ボタン電池は「乾電池類」、自動車のバッテリーは市では処理できません。"

/** 大型ごみ(市の家庭ごみの分別表・多量のごみや大型ごみのページ) */
const OGATA =
  "ごみステーションには出せません。鯖江クリーンセンターへ自分で持ち込みます(有料。受付日・手数料は市の公式サイトでご確認ください)。持ち込めるのは、たて・よこ・高さのどれかが50cmを超え2mまでのもの、棒状のものは直径10cm未満・長さ2m未満のもの。葉・芝・草などは中身の分かる袋に詰めます(市の50音別ごみ分別早見表)。自分で運べないときは、市が許可したごみ収集業者に有料の戸別収集を頼めます(業者の一覧は市の「多量のごみや大型ごみ(粗大ごみ)を専門業者へ依頼し処理する方法」のページ)。50cm以下に切れば、材質に合わせて燃やすごみ・燃えないごみに出せる品目もあります(品目ごとの案内に従います)。灯油・電池は抜いてから出します。"

const opts: ConvertOptions = {
  cityCode: "182079",
  cityName: "鯖江市",
  requireEmptyBunrui: false,
  trailingEmptyColumns: 1,
  labelRewrites: {
    "小型家電（15cm×30cmのもの）燃えないごみ": `小型家電（15cm×30cmのもの）${LABEL_JOINER}燃えないごみ`,
    "小型家電（15cm×30cmのもの）大型ごみ": `小型家電（15cm×30cmのもの）${LABEL_JOINER}大型ごみ`,
    "小型家電（15cm×30cmのもの）持ち込み": `小型家電（15cm×30cmのもの）${LABEL_JOINER}持ち込み`,
  },
  // 書き損じ: 備考と9列目に、別の行の「大型ごみ」「サイクリングマシン、ランニングマシン、マッサージ機等」が入っている
  rowFixes: { 携帯電話の充電器: { dropBiko: true, dropExtra: true } },
}

export const sabaeCityConfig: StandardCsvConfig = {
  slug: "sabae-city",
  name: "鯖江市",
  watch: {
    kind: "page-content",
    pageUrl:
      "https://www.pref.fukui.lg.jp/doc/dx-suishin/list_ct_gomibunbetu_d/fil/sabaeshibunbetu.csv",
    select: (text) => text,
  },
  encoding: "utf-8",
  headerPrefix: "",
  expectedMinItems: 900,
  labelSeparator: LABEL_JOINER,
  labelToId: {
    燃やすごみ: "moyasu",
    燃えないごみ: "moenai",
    大型ごみ: "ogata",
    クリーンセンターへ持込み: "mochikomi",
    持ち込み: "mochikomi",
    "小型家電(15cm×30cmのもの)": "kogata",
    "色トレー・その他プラ容器包装": "pla",
    容器包装以外のプラスチック類: "seihin-pla",
    白トレー: "shiro-tray",
    空きびん: "bin",
    空き缶: "kan",
    ペットボトル: "pet",
    雑紙類: "zatsugami",
    雑誌類: "zasshi",
    新聞紙: "shinbun",
    段ボール類: "danboru",
    牛乳パック等: "pack",
    繊維類: "seni",
    "廃食用油(天ぷら油)": "oil",
    蛍光灯: "keikou",
    スプレー缶類: "spray",
    乾電池類: "kandenchi",
    充電式電池を含む製品: "juden",
    回収ボックス: "ink",
    市では処理不能: "fuka",
  },
  officialLink: {
    moyasu: BUNBETSU,
    moenai: BUNBETSU,
    ogata: SYORI,
    mochikomi: BUNBETSU,
    kogata: KOGATA,
    pla: BUNBETSU,
    "seihin-pla": BUNBETSU,
    "shiro-tray": BUNBETSU,
    bin: BUNBETSU,
    kan: BUNBETSU,
    pet: BUNBETSU,
    zatsugami: BUNBETSU,
    zasshi: BUNBETSU,
    shinbun: BUNBETSU,
    danboru: BUNBETSU,
    pack: BUNBETSU,
    seni: BUNBETSU,
    oil: BUNBETSU,
    keikou: BUNBETSU,
    spray: BUNBETSU,
    kandenchi: JUDEN,
    juden: JUDEN,
    ink: BUNBETSU,
    fuka: BUNBETSU,
  },
  notCollectedIds: ["fuka"],
  // 市のページ(家庭ごみの分別表・使用済小型家電・充電式電池の捨て方・小型充電式電池・多量のごみや大型ごみ)の事実
  categoryNotes: {
    moyasu: `町内ごとに決められた収集日に、ごみステーションへ出します(収集日は市の「家庭ごみの分け方・出し方」で)。50cmを超えるものは大型ごみです(品目ごとの案内に従います)。${BATTERY}`,
    moenai: `町内ごとに決められた収集日に、ごみステーションへ出します。50cmを超えるものは大型ごみです(品目ごとの案内に従います)。小型の家電は、市役所・スーパー・量販店などの回収ボックスにも出せます(投入口15cm×30cmに入るもの。乾電池・水銀電池・電球・蛍光灯は入れない。データは消してから)。${BATTERY}`,
    ogata: `${OGATA}${BATTERY}`,
    mochikomi: `ごみステーションには出せません。鯖江クリーンセンターへ自分で持ち込みます(品目ごとの条件・量の制限に従います)。${BATTERY}`,
    kogata: `市役所・スーパー・量販店などに置いてある小型家電の回収ボックスに入れます(投入口15cm×30cmに入るもの。設置場所は市のページ)。データは消してから。携帯電話・デジタルカメラ・ノートパソコンなどの充電式電池は取り出して別々にします(取り出せないものは無理に分解せず、製品のまま「充電式電池を含む製品」のボックスへ)。乾電池・水銀電池・電球・蛍光灯は入れません。投入口に入らないものは、品目ごとの案内に従って出します。${BATTERY}`,
    pla: "資源ごみの収集日に、町内のごみステーションへ出します。残り水などで軽く汚れをすすぎます。",
    "seihin-pla": `資源ごみの収集日に、町内のごみステーションへ出します。50cmを超えるものは大型ごみです(品目ごとの案内に従います)。電池や電池の入った製品は混ぜないでください。${BATTERY}`,
    "shiro-tray": "資源ごみの収集日に、町内のごみステーションへ出します。雨の日は出さないでください(市のページ)。",
    bin: "資源ごみの収集日に、町内のごみステーションへ出します。",
    kan: "資源ごみの収集日に、町内のごみステーションへ出します。スプレー缶・カセットボンベは「スプレー缶類」です。",
    pet: "資源ごみの収集日に、町内のごみステーションへ出します。",
    zatsugami: "資源ごみの収集日に、町内のごみステーションへ出します。",
    zasshi: "資源ごみの収集日に、町内のごみステーションへ出します。",
    shinbun: "資源ごみの収集日に、町内のごみステーションへ出します。",
    danboru: "資源ごみの収集日に、町内のごみステーションへ出します。",
    pack: "資源ごみの収集日に、町内のごみステーションへ出します。",
    seni: "資源ごみの収集日に、町内のごみステーションへ出します。",
    oil: "地区ごとに決められた回収日に出します(市の公式サイトでご確認ください)。",
    keikou: `資源ごみの収集日に、町内のごみステーションへ出します(出し方は品目ごとの案内と、市の「家庭ごみの分け方・出し方」に従います)。割らずにそのまま出します。${BATTERY}`,
    spray:
      "資源ごみの収集日に、町内のごみステーションの専用コンテナへ出します。火の気のない風通しのよい屋外で中身を出し切り、穴は開けません(品目ごとの案内に従います)。",
    kandenchi: `資源ごみの収集日に、町内のごみステーションの乾電池のボックスへ出します(出し方は品目ごとの案内と、市の「家庭ごみの分け方・出し方」に従います)。${BATTERY}`,
    juden: BATTERY,
    ink: "公共施設や家電販売店などのインクカートリッジ回収ボックスへ入れます。",
    fuka: `品目ごとの案内の窓口(購入先・販売店・廃棄物処理業者など)に相談してください。家電4品目(テレビ・エアコン・冷蔵庫・冷凍庫・洗濯機・衣類乾燥機)は、買い替える店か買った店などに引き取りを頼みます(家電リサイクル法)。${BATTERY}`,
  },
  itemNotes: {
    // 灯油そのものは「市では処理不能」。ビニール製のポンプは容器包装以外のプラスチック類で、区分の説明に灯油の扱いが無い
    "灯油ポンプ（ビニール製）": `${NOTE}中の灯油は抜いてから出します(灯油そのものは市では処理できません。購入先などに相談します)。`,
    携帯電話の充電器: `${NOTE}県のデータのこの行には、別の品目の言葉(「大型ごみ」「サイクリングマシン、ランニングマシン、マッサージ機等」)が紛れ込んでいたので、取り除いて表示しています。`,
  },
}

const base = createStandardCsvAdapter(sabaeCityConfig)

export const sabaeCityAdapter: StandardCsvAdapter = {
  ...base,
  parse: (source) =>
    parseStandardCsv(sabaeCityConfig, toStandardCsv(source, opts)),
}
