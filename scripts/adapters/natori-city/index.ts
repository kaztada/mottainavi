import {
  type StandardCsvAdapter,
  type StandardCsvConfig,
  createStandardCsvAdapter,
  parseStandardCsv,
} from "../../core/standard-csv"
import { toStandardCsv } from "./convert"

/**
 * 名取市。宮城県オープンデータポータル「【名取市】ゴミの分別方法一覧」(CC BY 4.0、Shift_JIS、880品名、2026-03-13 更新)。
 * 市の「家庭ごみの分け方・出し方早見表 令和8年4月」(名取市・岩沼市・亘理町・山元町、亘理名取共立衛生処理組合)と全件照合済み
 * (2026-10-23。880品名の区分がすべて一致、注意点も857件が文字まで一致)。標準形式から「全国地方公共団体コード」が抜けた形なので、
 * convert.ts でコードを足し、品目名の途中の改行と「ℓ」「☎」の文字化けを直してから共通アダプタで読む。
 * 粗大ごみは集積所に出せず、岩沼東部環境センターへの自己搬入か代行運搬なので、事前申込制の bulky にしない(non-burnable + accepts_large_items)。
 * 市のサイト本体はオープンデータではないので、区分の説明は市のページ・早見表の事実を自分の言葉で書いた。
 * 取得元の URL は data/municipalities/natori-city/source.json。
 */
const PAGE = "https://www.city.natori.miyagi.jp/page/4724.html" // ごみの出し方・分け方(2026-04-01)
const SODAI = "https://www.city.natori.miyagi.jp/page/4726.html" // 集積所に出せないごみ(2024-10-01)
const KOGATA = "https://www.city.natori.miyagi.jp/page/4729.html" // 小型家電製品の処分方法(2024-01-10)
const KIKEN = "https://www.city.natori.miyagi.jp/page/18692.html" // 危険物をごみ袋に入れないでください(2025-09-30)

/** 電池の出し方(リチウムイオン電池を含んだごみの処理について・早見表の前書き・有害・危険ごみ品目一覧表) */
const BATTERY =
  "電池式・充電式のものは、プラスチック資源やもえるごみの袋に入れません。乾電池式のものは、電池を外して本体を複合素材製品類へ(外した電池は有害・危険ごみ)。充電して使うものは、充電池を取り除けるなら、電池は有害・危険ごみ、本体は複合素材製品類のコンテナへ。取り除けない(わからない)ものは、電池を入れたまま有害・危険ごみのコンテナへ出します。モバイルバッテリー・電子たばこ・加熱式たばこ・ワイヤレスイヤホンも有害・危険ごみです。スマートフォン・携帯電話・タブレット端末は処理対象外(販売店かメーカーに相談)。"

const SODAI_HOW =
  "ごみ集積所には出せません。岩沼東部環境センター「ぽぽか」へ自分で持ち込むか(月〜土曜日、祝日も可。9:00〜11:30・13:00〜16:00。50kgまで750円、超えると10kgにつき150円。内容によって受け付けできないことがあるので事前に確認)、代行運搬(0223-35-3020)を申し込みます。"

const NOTE = "※もったいナビ注: "

/** 灯油が残るおそれのある容器(早見表で灯油そのものは処理対象外=販売店に相談) */
const TOYU = `${NOTE}中の灯油は使い切るか抜いてから出します。灯油そのものは市では処理しないので、販売店に相談します(市の早見表)。`

export const natoriCityConfig: StandardCsvConfig = {
  slug: "natori-city",
  name: "名取市",
  watch: {
    kind: "page-content",
    pageUrl: "https://miyagi.dataeye.jp/resource_download/32737",
    select: (text) => text,
  },
  encoding: "shift_jis",
  headerPrefix: "",
  expectedMinItems: 850,
  labelToId: {
    もえるごみ: "moeru",
    プラスチック資源: "pla",
    複合素材製品類: "fukugo",
    金属製品類: "kinzoku",
    ガラスくず類: "garasu",
    せともの類: "setomono",
    "有害・危険ごみ": "yugai",
    粗大ごみ: "sodai",
    処理対象外: "taishogai",
    紙製容器包装類: "kamiyoki",
    紙パック: "pack",
    段ボール: "danboru",
    新聞: "shinbun",
    雑誌: "zasshi",
    布類: "nuno",
    缶類: "kan",
    びん類: "bin",
    ペットボトル: "pet",
  },
  officialLink: {
    moeru: PAGE,
    pla: KIKEN,
    fukugo: KOGATA,
    kinzoku: PAGE,
    garasu: PAGE,
    setomono: PAGE,
    yugai: KIKEN,
    sodai: SODAI,
    taishogai: PAGE,
    kamiyoki: PAGE,
    pack: PAGE,
    danboru: PAGE,
    shinbun: PAGE,
    zasshi: PAGE,
    nuno: PAGE,
    kan: PAGE,
    bin: PAGE,
    pet: PAGE,
  },
  notCollectedIds: ["taishogai"],
  // 市のページ(ごみの出し方・分け方・集積所に出せないごみ・小型家電製品・危険物)と早見表(令和8年4月)の事実
  categoryNotes: {
    moeru: `週2回、名取市の指定ごみ袋に入れて出します。生ごみは十分に水を切ります。じゅうたん・カーテンなどの広がるものは一辺60cm以内、木片は長さ60cm・太さ10cm以内に切ります。指定袋に入らないものは粗大ごみです。${BATTERY}`,
    pla: `週1回、リサイクル資源袋に入れて出します(ほかの区分と混ぜた袋は収集されません)。容器包装と、一辺50cm未満のプラスチック素材100%の製品が対象です(ネジなどの金属を含むものは複合素材製品類)。汚れが落ちないものはもえるごみ。ライター・スプレー缶は有害・危険ごみです。${BATTERY}`,
    fukugo: `月1回、集積所の専用コンテナ(縦35cm・横50cm・高さ25cmに入る大きさ)に入れます。はみ出すものは粗大ごみです。個人情報は消してから出します。${BATTERY}`,
    kinzoku: `月1回、集積所の専用コンテナ(縦35cm・横50cm・高さ25cmに入る大きさ)に入れます。金属素材だけの製品や、飲料・食用以外の缶が対象です。はみ出すものは粗大ごみです。${BATTERY}`,
    garasu: "月1回、集積所の専用コンテナに入れます。飲料・食用以外のびん、割れたびん、ガラスが対象です。",
    setomono: "月1回、集積所の専用コンテナに入れます。陶器製の食器・鉢・花瓶など(瓦などの建築廃材は対象外)。",
    yugai: `月1回、集積所の専用コンテナに種類別に入れます(袋に入れて集積所に出さない)。体温計・蛍光管・電球・乾電池、花火など、刃物類が対象です。カセットボンベ・スプレー缶は使い切ってから(穴はあけなくてもよい)。包丁・カッターの刃などは新聞紙に包み「危険」と書きます。${BATTERY}`,
    sodai: `${SODAI_HOW}指定ごみ袋やコンテナに入らないものが粗大ごみです。電池式・充電式のもので、コンテナに入るものは品目ごとの案内に従います。${BATTERY}`,
    taishogai: `品目ごとの案内の窓口(販売店・メーカー・専門の業者など)に相談してください。家電4品目(テレビ・エアコン・冷蔵庫・冷凍庫・洗濯機・衣類乾燥機)は、販売店に引き取りを頼むか、郵便局でリサイクル券を買って指定引取場所へ(家電リサイクル法)。パソコンはメーカーかパソコン3R推進センターへ。${BATTERY}`,
    kamiyoki: "週1回、リサイクル資源袋に入れて出します。紙マークのあるもの、ノート・紙芯・画用紙も対象です。感熱紙・カーボン紙・汚れたものはもえるごみ。",
    pack: "月2回、ひもで縛って集積所に出します。水洗いし、開いて乾かしてから。内側がアルミ箔のものは紙製容器包装類です。",
    danboru: "月2回、ひもで十字に縛って集積所に出します。",
    shinbun: "月2回、ひもで十字に縛って集積所に出します(新聞紙とチラシは分けなくてもよい)。",
    zasshi: "月2回、ひもで十字に縛って集積所に出します。",
    nuno: "月2回、ひもで十字に縛って集積所に出します。綿50%以上のものが対象(毛糸素材はもえるごみ)。",
    kan: "週1回、集積所の専用コンテナに入れます。飲料・食用の缶が対象(それ以外は金属製品類)。水洗いします。スプレー缶は使い切って有害・危険ごみへ。",
    bin: "週1回、集積所の色別の専用コンテナに入れます。飲料・食用のびんが対象(それ以外・油分や汚れが落ちないもの・化粧品のびんはガラスくず類)。水洗いします。",
    pet: "週1回、リサイクル資源袋に入れて出します。軽く水洗いし、ラベルとふたはプラスチック資源へ。",
  },
  itemNotes: {
    "灯油タンク（ボイラー用）（200ℓ以内）": TOYU,
    "ホームタンク（200ℓ以内）": TOYU,
    "石油ポンプ(灯油ポンプ)": TOYU,
  },
}

const base = createStandardCsvAdapter(natoriCityConfig)

export const natoriCityAdapter: StandardCsvAdapter = {
  ...base,
  parse: (source) => parseStandardCsv(natoriCityConfig, toStandardCsv(source)),
}
