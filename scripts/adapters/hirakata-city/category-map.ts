/**
 * 枚方市 Excel の「収集区分」→ 区分ID(data/municipalities/hirakata-city/categories.json と一致させる)。
 * 1セルに複数区分が改行で入ることがあるので、parse 側で行ごとに分けてから引く。
 * 「大型ごみ600円」のように金額付きの表記は ogata に寄せ、金額は parse 側で取り出す。
 */
const BASE = "https://www.city.hirakata.osaka.jp/"

/** 正規化済みラベル → 区分ID(金額付きの大型ごみは FEE_RE で別に判定) */
export const LABEL_TO_ID: Record<string, string> = {
  一般ごみ: "ippan",
  "ペットボトル・プラスチック製容器包装": "pet-pla",
  "空き缶、びん・ガラス類": "kan-bin",
  "空き缶・びん・ガラス類": "kan-bin",
  紙類: "kami",
  分別回収: "bunbetsu",
  粗ごみ: "aragomi",
  大型ごみ: "ogata",
  "粗ごみ・大型ごみ": "aragomi-ogata",
  "粗ごみ・大型": "aragomi-ogata",
  処理困難物: "konnan",
  市で処理しないもの: "shori-shinai",
  市で収集しないもの: "shori-shinai",
  家電リサイクル品目: "kaden",
  PCリサイクル品目: "pc",
  "臨時ごみ・持ち込み動物": "kobetsu",
  "臨時ごみ・持ち込みごみ": "kobetsu",
  "臨時ごみ・持込みごみ、動物": "kobetsu",
}

/**
 * 「条件によってどちらか」を「・」でつないだ表記。カードを区分ごとに分ける
 * (市の表記そのものは parse 側で1枚目の注意文言に残す)
 */
export const COMPOUND_LABELS: Record<string, string[]> = {
  "一般ごみ・粗ごみ": ["一般ごみ", "粗ごみ"],
  "処理困難物・大型ごみ": ["処理困難物", "大型ごみ"],
}

/** 「大型ごみ600円」「粗ごみ・大型ごみ300円」の金額部分 */
export const FEE_RE = /(\d{3,5})円$/

/** 区分IDごとの表示名(categories.json の name_ja と一致) */
export const CATEGORY_NAME: Record<string, string> = {
  ippan: "一般ごみ",
  "pet-pla": "ペットボトル・プラスチック製容器包装",
  "kan-bin": "空き缶・びん・ガラス類",
  kami: "紙類",
  bunbetsu: "分別回収",
  aragomi: "粗ごみ",
  ogata: "大型ごみ",
  "aragomi-ogata": "粗ごみ・大型ごみ(サイズで判断)",
  konnan: "処理困難物",
  "shori-shinai": "市で処理しないもの",
  kaden: "家電リサイクル品目",
  pc: "PCリサイクル品目",
  kobetsu: "個別の出し方",
}

/** 表記ゆれだけで、注意文言に市の表記を残す必要がないラベル(正規化後) */
export const SAME_AS_CATEGORY = new Set([
  "一般ごみ",
  "ペットボトル・プラスチック製容器包装",
  "空き缶、びん・ガラス類",
  "空き缶・びん・ガラス類",
  "紙類",
  "分別回収",
  "粗ごみ",
  "大型ごみ",
  "粗ごみ・大型ごみ",
  "粗ごみ・大型",
  "処理困難物",
  "市で処理しないもの",
  "市で収集しないもの",
  "家電リサイクル品目",
  "PCリサイクル品目",
])

/**
 * 区分の説明(市の公式ページ・一覧表の記載に基づく)。
 * 注意文言の先頭、または複数区分セルの2枚目以降のカードに使う。
 * 市の注意点にすでに同じ内容(GUIDE_ALREADY_SAID)があれば重ねて入れない。
 */
export const CATEGORY_GUIDE: Record<string, string> = {
  "aragomi-ogata":
    "サイズ判断品目: 幅・奥行き・高さが1メートル未満は粗ごみ(無料)、1辺が1メートル以上は大型ごみ(有料)。どちらも粗大ごみ予約センターへの申込みが必要です。",
  konnan: "販売店・製造元に相談。または、ごみ処理(一般廃棄物)業者に依頼。",
  "shori-shinai": "市では処理しません。",
  kaden: "家電リサイクル法の対象品目で、市では収集しません。",
}

/** 注意点にこの語句があれば、区分の説明は重ねて入れない */
export const GUIDE_ALREADY_SAID: Record<string, RegExp> = {
  konnan: /販売店・製造元に相談/,
}

/** 区分ごとの公式ページ(Excel の行には公式リンクが無いため区分単位で付ける) */
const SODAI = BASE + "0000002820.html" // 家庭から出るごみ・粗大ごみ
const LIST = BASE + "0000024067.html" // ごみの分別一覧表(50音順)
export const OFFICIAL_LINK: Record<string, string> = {
  ippan: LIST,
  "pet-pla": LIST,
  "kan-bin": LIST,
  kami: LIST,
  bunbetsu: LIST,
  aragomi: SODAI,
  ogata: SODAI,
  "aragomi-ogata": SODAI,
  konnan: LIST,
  "shori-shinai": LIST,
  kaden: LIST,
  pc: LIST,
  kobetsu: LIST,
}

/** ラベルの正規化: NFKC(全角英数・括弧の統一)→全空白除去 */
export function normalizeLabel(label: string): string {
  return label.normalize("NFKC").replace(/[\s　]/g, "")
}

/** 金額を除いたラベルで区分IDを引く(「大型ごみ600円」→ ogata) */
export function resolveCategoryId(label: string): string | null {
  const n = normalizeLabel(label).replace(FEE_RE, "")
  return LABEL_TO_ID[n] ?? null
}

/** ラベルに付いた大型ごみの手数料(円)。無ければ null */
export function feeFromLabel(label: string): number | null {
  const m = normalizeLabel(label).match(FEE_RE)
  return m ? Number(m[1]) : null
}
