import type { CategoryId } from "../../../src/lib/schemas"

/**
 * 市ページの収集区分ラベル → category_id のマッピング。
 * ラベルは正規化(空白除去・括弧統一)してから引く。
 */
export const LABEL_TO_ID: Record<string, CategoryId> = {
  // 大阪市の区分ID(data/municipalities/osaka-city/categories.json と一致させる)
  普通ごみ: "futsu",
  資源ごみ: "shigen",
  プラスチック資源: "plastic",
  "古紙・衣類": "koshi-irui",
  粗大ごみ: "sodai",
  小型家電リサイクル回収: "kogata-kaden",
  // NFKC正規化後は括弧が半角になるため、キーは半角括弧で持つ
  "小型家電リサイクル回収(宅配便)": "kogata-kaden-takuhai",
  パソコンリサイクル回収: "pc-recycle",
  拠点回収: "kyoten",
  資源集団回収: "shudan-kaishu",
  リチウムイオン電池等の回収: "li-ion",
  収集しません: "not-collected",
}

/** ラベル文字列の正規化: NFKC(全角括弧・英数の統一を含む)→全空白除去 */
export function normalizeLabel(label: string): string {
  return label.normalize("NFKC").replace(/[\s　]/g, "")
}

/** 区分ラベルを category_id に解決。未知ラベルは null */
export function resolveCategoryId(label: string): CategoryId | null {
  return LABEL_TO_ID[normalizeLabel(label)] ?? null
}
