/**
 * 収集区分の「意味種別」(data-model.md §10)。
 * 区分名・区分数は自治体ごとに違うが、UIロジックとパイプラインは区分IDではなく kind で判定する。
 * 例: 粗大ごみ申込セクションの表示(bulky)、注意文言欠落チェック(not-collected)
 *
 * このモジュールはクライアントからも読むため zod に依存させない(スキーマは schemas.ts)。
 */
export const CATEGORY_KINDS = [
  "burnable", // 可燃・普通ごみ
  "non-burnable", // 不燃ごみ
  "recyclable", // 資源(缶・びん・PET)
  "plastic", // プラスチック資源
  "paper", // 古紙・紙類(衣類を含む自治体あり)
  "bulky", // 粗大ごみ
  "small-appliance", // 小型家電リサイクル回収
  "maker-recycle", // メーカー・販売店による回収(パソコンリサイクル等)
  "hazardous", // 電池・スプレー缶などの危険物
  "drop-off", // 拠点回収・集団回収
  "not-collected", // 市が収集しない
  "other",
] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]

/**
 * kind ごとの既定の色・アイコン。自治体の categories.json で color/icon を省略したときに使う。
 * 値は大阪市版(v0.1)の配色を踏襲している。
 */
export const KIND_DEFAULTS: Record<
  CategoryKind,
  { color: string; icon: string }
> = {
  burnable: { color: "#8E8E93", icon: "trash" },
  "non-burnable": { color: "#636366", icon: "package-x" },
  recyclable: { color: "#34C759", icon: "recycle" },
  plastic: { color: "#FF9F0A", icon: "package" },
  paper: { color: "#5AC8FA", icon: "newspaper" },
  bulky: { color: "#AF52DE", icon: "sofa" },
  "small-appliance": { color: "#007AFF", icon: "smartphone" },
  "maker-recycle": { color: "#007AFF", icon: "laptop" },
  hazardous: { color: "#FF3B30", icon: "triangle-alert" },
  "drop-off": { color: "#00C7BE", icon: "map-pin" },
  "not-collected": { color: "#1C1C1E", icon: "x-circle" },
  other: { color: "#8E8E93", icon: "circle-help" },
}

/** 区分の表示色・アイコンを解決する(自治体の上書き → kind の既定値) */
export function resolveCategoryStyle(category: {
  kind: CategoryKind
  color?: string
  icon?: string
}): { color: string; icon: string } {
  const d = KIND_DEFAULTS[category.kind]
  return { color: category.color ?? d.color, icon: category.icon ?? d.icon }
}
