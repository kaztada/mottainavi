/**
 * 河内長野市「家庭用ごみの分別辞典」の「分別の種類」→ 区分ID
 * (data/municipalities/kawachinagano-city/categories.json と一致させる)。
 */
const BASE = "https://www.city.kawachinagano.lg.jp/"

/** 品目行の区分名(PDF 上の表記)。長いものから順に照合する */
export const CATEGORY_LABELS = [
  "通常の収集（集積所からの収集）では回収できません",
  "もえないごみ・粗大ごみ",
  "もえないごみ.粗大ごみ",
  "資源ごみ（プラスチック製容器包装）",
  "資源ごみ（ペットボトル）",
  "資源ごみ（小型金属類）",
  "資源ごみ（小型金属）",
  "資源ごみ（カン）",
  "資源ごみ（びん）",
  "資源ごみ（古紙）",
  "資源ごみ（古布）",
  "個別説明いたします",
  "回収できません",
  "廃油回収へ",
  "もえるごみ",
]

export const LABEL_TO_ID: Record<string, string> = {
  "通常の収集（集積所からの収集）では回収できません": "kaden",
  "もえないごみ・粗大ごみ": "moenai-sodai",
  "もえないごみ.粗大ごみ": "moenai-sodai",
  "資源ごみ（プラスチック製容器包装）": "pla",
  "資源ごみ（ペットボトル）": "pet",
  "資源ごみ（小型金属類）": "kinzoku",
  "資源ごみ（小型金属）": "kinzoku",
  "資源ごみ（カン）": "kan",
  "資源ごみ（びん）": "bin",
  "資源ごみ（古紙）": "koshi",
  "資源ごみ（古布）": "kofu",
  個別説明いたします: "kobetsu",
  回収できません: "fuka",
  廃油回収へ: "haiyu",
  もえるごみ: "moeru",
}

/** 区分IDごとの表示名(categories.json の name_ja と一致) */
export const CATEGORY_NAME: Record<string, string> = {
  moeru: "もえるごみ",
  "moenai-sodai": "もえないごみ・粗大ごみ",
  kan: "資源ごみ(カン)",
  bin: "資源ごみ(びん)",
  kinzoku: "資源ごみ(小型金属)",
  pet: "資源ごみ(ペットボトル)",
  pla: "資源ごみ(プラスチック製容器包装)",
  koshi: "資源ごみ(古紙)",
  kofu: "資源ごみ(古布)",
  fuka: "回収できません",
  kaden: "通常の収集では回収できません",
  haiyu: "廃油回収",
  kobetsu: "個別の出し方",
}

/**
 * 区分の説明(市の「ごみガイドブック」の記載に基づく)。注意文言の先頭に置く。
 * 「もえないごみ・粗大ごみ」は申込制ではないことを明記する(申込制と誤解させないため)。
 * 「通常の収集では回収できません」は家電リサイクル法の品目だけでなくタブレット等も含むため、説明は付けない(市の備考に任せる)。
 */
export const CATEGORY_GUIDE: Record<string, string> = {
  "moenai-sodai":
    "月1回の収集です(申込みは不要)。「もえないごみ・粗大ごみシール」を推奨ごみ袋に1枚、袋に入らない大きなものは1点につき1枚貼って出します。シールは毎年3月末に各家庭へ無料配布され、足りない場合は有料シールをごみ処理券取扱所で購入します。",
}

/** 市の備考が空のときに入れる文(区分の意味をそのまま文にしたもの。誤案内リスク最大の区分で注意文言を欠かさないため) */
export const EMPTY_NOTE_FALLBACK: Record<string, string> = {
  fuka: "市では回収できません。",
  kaden: "市の通常の収集(集積所からの収集)では回収できません。",
}

/** 市の表記を注意文言の先頭に残す区分(表示名だけでは意味が伝わりにくいもの) */
export const KEEP_LABEL = new Set(["kobetsu"])

/** 区分ごとの公式ページ */
const GUIDE = BASE + "soshiki/15/1797.html" // ごみと資源の分け方・出し方
const DICT = BASE + "soshiki/15/1796.html" // 家庭用ごみの分別辞典
export const OFFICIAL_LINK: Record<string, string> = {
  moeru: GUIDE,
  "moenai-sodai": GUIDE,
  kan: GUIDE,
  bin: GUIDE,
  kinzoku: GUIDE,
  pet: GUIDE,
  pla: GUIDE,
  koshi: GUIDE,
  kofu: GUIDE,
  fuka: DICT,
  kaden: DICT,
  haiyu: DICT,
  kobetsu: DICT,
}

export function resolveCategoryId(label: string): string | null {
  return LABEL_TO_ID[label.trim()] ?? null
}
