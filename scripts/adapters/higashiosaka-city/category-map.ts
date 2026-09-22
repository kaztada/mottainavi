/**
 * 東大阪市 CSV の「分別区分」→ 区分ID(data/municipalities/higashiosaka-city/categories.json と一致させる)。
 * 表記ゆれ(「かんびん」「家庭ごみ(もえるもの）」等)はここで吸収する。
 * 区分名と違う市の表記(回収協力店の種類・個別指示)は parse 側で注意文言の先頭に残す。
 */
const BASE = "https://www.city.higashiosaka.lg.jp/"

export const LABEL_TO_ID: Record<string, string> = {
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
}

/** 区分IDごとの表示名(categories.json の name_ja と一致) */
export const CATEGORY_NAME: Record<string, string> = {
  katei: "家庭ごみ(もえる物)",
  funen: "不燃の小物",
  "kan-bin": "あきかん・あきびん",
  plastic: "プラスチック製容器包装",
  pet: "ペットボトル",
  ogata: "大型ごみ",
  "kogata-box": "小型家電回収ボックス",
  shudan: "地域の集団回収",
  kyoten: "拠点回収",
  kyoryokuten: "回収協力店・回収ボックス",
  fuka: "市では収集しません",
  kobetsu: "個別の出し方",
}

/**
 * 市の表記のうち、区分名と同じ意味で注意文言に残す必要がないもの
 * (表記ゆれだけのもの。これ以外で区分名と違う表記は「出し方: …。」として残す)
 */
export const SAME_AS_CATEGORY = new Set([
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
])

/** 区分ごとの公式ページ(CSV の行には公式リンクが無いため区分単位で付ける) */
const GUIDE = BASE + "0000030162.html" // ごみの分け方・出し方(保存版)
export const OFFICIAL_LINK: Record<string, string> = {
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
}

/** ラベルの正規化: NFKC(全角括弧・英数の統一)→全空白除去 */
export function normalizeLabel(label: string): string {
  return label.normalize("NFKC").replace(/[\s　]/g, "")
}

export function resolveCategoryId(label: string): string | null {
  return LABEL_TO_ID[normalizeLabel(label)] ?? null
}
