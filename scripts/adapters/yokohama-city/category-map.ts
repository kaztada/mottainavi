/**
 * 横浜市 CSV の「出し方」ラベル → 区分ID(data/municipalities/yokohama-city/categories.json と一致させる)。
 *
 * 「出し方」は28種あり、主要な区分のほかに1〜4件しかない個別指示(「最寄りの警察署に相談」など)や
 * 複合表記(「販売店または缶・びん・ペットボトル」)が混ざる。これらは近い区分に寄せるが、
 * 市の表記そのものは parse 側でポイント欄の先頭に「出し方: …」として残し、情報を落とさない。
 */
const BASE =
  "https://www.city.yokohama.lg.jp/kurashi/sumai-kurashi/gomi-recycle/gomi/"

export const LABEL_TO_ID: Record<string, string> = {
  燃やすごみ: "moyasu",
  燃えないごみ: "moenai",
  プラスチック資源: "plastic",
  "缶・びん・ペットボトル": "kan-bin-pet",
  小さな金属類: "kinzoku",
  // 古紙4種は区分「古紙」にまとめる(種別はポイント先頭に残る)
  "古紙(雑誌・その他の紙)": "koshi",
  "古紙(紙パック)": "koshi",
  "古紙(段ボール)": "koshi",
  "古紙(新聞)": "koshi",
  古布: "kofu",
  粗大ごみ: "sodai",
  スプレー缶: "spray",
  電池類: "denchi",
  家電リサイクル: "kaden-recycle",
  パソコンリサイクル: "pc-recycle",
  販売店へ相談: "hanbaiten",
  登録販売店に相談: "hanbaiten",
  販売店か回収協力店: "hanbaiten",
  // 複合表記は主区分に寄せる
  "販売店または缶・びん・ペットボトル": "kan-bin-pet",
  // 個別指示(1〜4件)。kind other の「個別の出し方」に集約し、表記はポイント先頭に残す
  "医療機関・薬局または燃やすごみ": "kobetsu",
  "区役所・収集事務所または燃えないごみ": "kobetsu",
  専用回収箱または燃やすごみ: "kobetsu",
  "(株)消火器リサイクル推進センターへ": "kobetsu",
  個別に相談: "kobetsu",
  最寄りの警察署に相談: "kobetsu",
  トイレに流す: "kobetsu",
  その他: "kobetsu",
  収集事務所: "kobetsu",
}

/** 「小型家電回収対象」◎ の品目に合成する2つ目の区分行のラベル */
export const KOGATA_BOX_LABEL = "小型家電回収ボックス"

/** 区分IDごとの表示名(ラベルと一致するときはポイント先頭に表記を残さない) */
export const CATEGORY_NAME: Record<string, string> = {
  moyasu: "燃やすごみ",
  moenai: "燃えないごみ",
  plastic: "プラスチック資源",
  "kan-bin-pet": "缶・びん・ペットボトル",
  kinzoku: "小さな金属類",
  koshi: "古紙",
  kofu: "古布",
  sodai: "粗大ごみ",
  spray: "スプレー缶",
  denchi: "電池類",
  "kogata-box": KOGATA_BOX_LABEL,
  "kaden-recycle": "家電リサイクル",
  "pc-recycle": "パソコンリサイクル",
  hanbaiten: "販売店へ相談",
  kobetsu: "個別の出し方",
}

/** 区分ごとの公式ページ(CSV の行には公式リンクが無いため区分単位で付ける) */
export const OFFICIAL_LINK: Record<string, string> = {
  moyasu: BASE + "shushu/das1.html",
  moenai: BASE + "shushu/das11.html",
  plastic: BASE + "shushu/plasigen.html",
  "kan-bin-pet": BASE + "shushu/das2.html",
  kinzoku: BASE + "shushu/das8.html",
  koshi: BASE + "kaishu/das14.html",
  kofu: BASE + "kaishu/das13.html",
  sodai: BASE + "shushu/sodaigomi/index.html",
  spray: BASE + "shushu/das10.html",
  denchi: BASE + "shushu/das4.html",
  "kogata-box": BASE + "tyokusetsu/koden.html",
  "kaden-recycle": BASE + "shushufuka/kadenseihin/index.html",
  "pc-recycle": BASE + "shushufuka/pc.html",
  hanbaiten: BASE + "shushufuka/das6.html",
  kobetsu: BASE + "dashikata.html",
}

/** ラベルの正規化: NFKC(全角括弧・英数の統一)→全空白除去 */
export function normalizeLabel(label: string): string {
  return label.normalize("NFKC").replace(/[\s　]/g, "")
}

export function resolveCategoryId(label: string): string | null {
  return LABEL_TO_ID[normalizeLabel(label)] ?? null
}
