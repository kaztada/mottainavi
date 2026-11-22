// 未対応の市区町村の「公式への導線」のうち、画面(ブラウザで動く部品)で使う定数・型・小さな関数。
// クライアントに zod を持ち込まないため、検査(zod)は src/lib/official-guides.ts に分けている。

/** 導線の種類。画面にはこの順で、種類ごとに1件まで出す */
export const GUIDE_KINDS = [
  "search", // 品目で調べる(市の検索システム)
  "list", // 品目の一覧(HTML の表・PDF)
  "app", // アプリの案内のページ
  "top", // ごみ・リサイクルのページ
] as const
export type GuideKind = (typeof GUIDE_KINDS)[number]

/** リンク先そのものの形 */
export const GUIDE_TARGETS = ["html-page", "pdf"] as const
export type GuideTarget = (typeof GUIDE_TARGETS)[number]

/** リンク先から読める資料の形 */
export const GUIDE_DOCUMENTS = [
  "html",
  "text-pdf", // 文字のある PDF(ページ内検索ができる)
  "image-pdf", // 画像の PDF(文字が取れない)
  "search",
  "app",
] as const
export type GuideDocument = (typeof GUIDE_DOCUMENTS)[number]

/** 資料が市のどこまでに当てはまるか。地区だけの資料は値として持てない(市全体向けの導線にしないため) */
export const GUIDE_SCOPES = [
  "whole", // 市全体
  "area-selector", // 地区を選ぶ入口のページ
] as const
export type GuideScope = (typeof GUIDE_SCOPES)[number]

/** 版の分かっている細かさ。分からないところは作らない */
export const EDITION_PRECISIONS = ["day", "month", "year", "fiscal-year"] as const
export type EditionPrecision = (typeof EDITION_PRECISIONS)[number]

export type Edition = { value: string; precision: EditionPrecision }

/** 画面に渡す導線1件(内部の項目=中の資料の URL・紹介元・目印は渡さない) */
export type PublicGuideLink = {
  kind: GuideKind
  url: string
  target: GuideTarget
  document: GuideDocument
  /** ページ内検索で品目名を探せるか(文字のある PDF・HTML のときだけ true) */
  searchable: boolean
  label_ja: string | null
  label_en: string | null
  edition: Edition | null
  /** 版が古い(ページを作るときに判定。2年より前) */
  edition_old: boolean
  /** 代表的な品目だけの一覧 */
  partial: boolean
  scope: GuideScope
  /** 外部のサイトのとき、そのサイトの名前 */
  via_name_ja: string | null
  via_name_en: string | null
}

export type PublicPhone = {
  dept_ja: string
  tel: string
  /** 内線など、番号に添える文(日本語のまま出す) */
  note_ja: string | null
  checked_at: string
}

export type PublicGuides = {
  checked_at: string
  links: PublicGuideLink[]
  phone: PublicPhone | null
}

/** 版の表示(日本語: 2026年4月版、英語: April 2026 edition) */
export function formatEdition(ed: Edition, lang: "ja" | "en"): string {
  const [y, m, d] = ed.value.split("-").map(Number)
  if (lang === "en") {
    const month = (n: number) =>
      new Date(Date.UTC(2000, n - 1, 1)).toLocaleString("en-US", {
        month: "long",
        timeZone: "UTC",
      })
    switch (ed.precision) {
      case "day":
        return `${month(m)} ${d}, ${y} edition`
      case "month":
        return `${month(m)} ${y} edition`
      case "year":
        return `${y} edition`
      case "fiscal-year":
        return `FY${y} edition`
    }
  }
  switch (ed.precision) {
    case "day":
      return `${y}年${m}月${d}日版`
    case "month":
      return `${y}年${m}月版`
    case "year":
      return `${y}年版`
    case "fiscal-year":
      return `${y}年度版`
  }
}

/**
 * 版が古いか(画面に「新しい版があるかは市のページで」を添える)。版の終わりの日から2年より前なら古い。
 * 年度は4月1日に始まり翌年の3月31日に終わる
 */
export function isOldEdition(ed: Edition, today: string): boolean {
  const [y, m] = ed.value.split("-").map(Number)
  let end: string
  switch (ed.precision) {
    case "day":
      end = ed.value
      break
    case "month": {
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
      end = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`
      break
    }
    case "year":
      end = `${y}-12-31`
      break
    case "fiscal-year":
      end = `${y + 1}-03-31`
      break
  }
  const [ty, tm, td] = today.split("-")
  const twoYearsAgo = `${Number(ty) - 2}-${tm}-${td}`
  return end < twoYearsAgo
}

/** 電話のリンク(tel:)に使う数字だけの形 */
export function telHref(tel: string): string {
  return `tel:${tel.replace(/[^0-9]/g, "")}`
}

/** 自治体の種類(名前の末尾の字)。公式への導線まわりの決まった文言を出し分ける(2026-11-21 Kaz 判断) */
export type MunicipalityKind = "city" | "town" | "village" | "ward"

const KIND_BY_SUFFIX: Record<string, MunicipalityKind> = {
  市: "city",
  町: "town",
  村: "village",
  区: "ward",
}

/** 名前の末尾の字(市・町・村・区)から種類を出す。どれでもなければ市として扱う(今の表示を変えない) */
export function municipalityKind(nameJa: string): MunicipalityKind {
  return KIND_BY_SUFFIX[nameJa.slice(-1)] ?? "city"
}

/** 文言に差し込む種類の語。日本語は「市」「町」「村」「区」、英語は city/town/village/ward */
export function kindWord(kind: MunicipalityKind, lang: "ja" | "en"): string {
  if (lang === "en") return kind
  return { city: "市", town: "町", village: "村", ward: "区" }[kind]
}
