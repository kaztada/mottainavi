/**
 * 平塚市 CSV の「分別区分」→ 区分ID(data/municipalities/hiratsuka-city/categories.json と一致させる)。
 * 表記ゆれ(「金属（資源再生物）」と「金属(資源再生物)」、半角カナの「ﾘｻｲｸﾙ」等)は NFKC で吸収する。
 * 1セルに2区分ある表記(「不燃ごみ又は処理困難物」)は parse 側で分割する。
 */
const BASE = "https://www.city.hiratsuka.kanagawa.jp/kankyo/"

export const LABEL_TO_ID: Record<string, string> = {
  可燃ごみ: "kanen",
  不燃ごみ: "funen",
  有害ごみ: "yugai",
  "金属(資源再生物)": "kinzoku",
  "空き缶類(資源再生物)": "akikan",
  "ビン(資源再生物)": "bin",
  "廃食用油(資源再生物)": "haiyu",
  ペットボトル: "pet",
  "古紙類(資源再生物)": "koshi",
  "布類(資源再生物)": "nuno",
  容器包装プラスチック: "pla",
  粗大ごみ: "sodai",
  小型家電: "kogata",
  リサイクル: "recycle",
  剪定枝: "sentei",
  家電リサイクル: "kaden",
  処理困難物: "konnan",
  産業廃棄物: "sangyo",
}

/** 区分IDごとの表示名(categories.json の name_ja と一致) */
export const CATEGORY_NAME: Record<string, string> = {
  kanen: "可燃ごみ",
  funen: "不燃ごみ",
  yugai: "有害ごみ",
  kinzoku: "金属(資源再生物)",
  akikan: "空き缶類(資源再生物)",
  bin: "ビン(資源再生物)",
  haiyu: "廃食用油(資源再生物)",
  pet: "ペットボトル",
  koshi: "古紙類(資源再生物)",
  nuno: "布類(資源再生物)",
  pla: "容器包装プラスチック",
  sodai: "粗大ごみ",
  kogata: "小型家電(回収ボックス)",
  recycle: "回収協力店・メーカー回収",
  sentei: "剪定枝(無料の各戸収集)",
  kaden: "家電リサイクル法の対象",
  konnan: "処理困難物(市では収集しません)",
  sangyo: "産業廃棄物(市では収集しません)",
}

/** 市では収集しない区分。注意文言の先頭に「市では収集しません。」を必ず置く */
export const NOT_COLLECTED = new Set(["kaden", "konnan", "sangyo"])

/** 区分ごとの公式ページ(CSV の行には公式リンクが無いため区分単位で付ける) */
const GUIDE = BASE + "page-c_01152.html" // 家庭のごみ・資源の分け方・出し方
export const OFFICIAL_LINK: Record<string, string> = {
  kanen: GUIDE,
  funen: GUIDE,
  yugai: GUIDE,
  kinzoku: GUIDE,
  akikan: GUIDE,
  bin: GUIDE,
  haiyu: GUIDE,
  pet: BASE + "page-c_01166.html",
  koshi: GUIDE,
  nuno: GUIDE,
  pla: BASE + "page-c_01156.html",
  sodai: BASE + "page-c_01174.html",
  kogata: BASE + "page-c_01216.html",
  recycle: GUIDE,
  sentei: BASE + "page-c_01229.html",
  kaden: BASE + "page-c_01169.html",
  konnan: GUIDE,
  sangyo: GUIDE,
}

/** ラベルの正規化: NFKC(半角カナ・全角括弧の統一)→全空白除去 */
export function normalizeLabel(label: string): string {
  return label.normalize("NFKC").replace(/[\s　]/g, "")
}

export function resolveCategoryId(label: string): string | null {
  return LABEL_TO_ID[normalizeLabel(label)] ?? null
}
