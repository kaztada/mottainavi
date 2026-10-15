// 仕分けの台帳のうち、画面(ブラウザで動く部品)で使う定数・型・小さな関数。
// クライアントに zod を持ち込まないため、検査(zod)は src/lib/coverage.ts に分けている。

/**
 * 台帳の状態。月末の最終の分類は available / hold / license / no-data の4つ(+対応済み)。
 * candidate(確認中)と unsurveyed(未調査)は途中の状態で、調べ終わったら最終の分類に移す。
 */
export const COVERAGE_STATUSES = [
  "available", // 入力できる: 利用の条件と、いまの分け方に合っていることを確かめ終わり、対応の順番待ち
  "candidate", // 確認中: データは見つかったが、利用の条件や、いまの分け方に合っているかを確かめている
  "hold", // 保留: 見つかったデータが、いまの分け方と合っていない、または合っているかを確かめられない
  "license", // 使える条件を確かめられない: 再利用できそうな形の品目一覧は見つかったが、このアプリで使ってよい条件を確かめられない
  "no-data", // 見つからない: オープンデータとしての品目一覧が見つからない(市のサイトの検索・PDF・アプリにしか無い場合を含む)
  "unsurveyed", // 未調査
] as const
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number]

/** 画面(未対応ページ)に渡す項目だけ。evidence・searched・note はブラウザに送らない */
export type PublicCoverage = {
  status: CoverageStatus
  checked_at: string | null
  detail_ja: string | null
  detail_en: string | null
}

/** 確かめた日の表示(日本語: 2026年10月3日、英語: 2026-10-03) */
export function formatCheckedAt(iso: string, lang: "ja" | "en"): string {
  if (lang === "en") return iso
  const [y, m, d] = iso.split("-").map(Number)
  return `${y}年${m}月${d}日`
}

/** 未対応ページで、状態ごとの文に使う翻訳キー */
export function reasonKey(status: CoverageStatus): string {
  return `unsupported.reason.${status}`
}

/** About の内訳に並べる順(対応済みのあと、この順) */
export const COVERAGE_DISPLAY_ORDER: readonly CoverageStatus[] = COVERAGE_STATUSES
