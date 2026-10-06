"use client"

import { useT } from "@/lib/i18n"

/** 境界データの出典ページ(国土数値情報 行政区域データ 2021年版) */
const MAP_SOURCE_URL =
  "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2021.html"
/** 国土数値情報の利用規約(出典の書き方と、加工した旨の記載が条件) */
const MAP_TERMS_URL = "https://nlftp.mlit.go.jp/ksj/other/agreement.html"

/**
 * 地図の出典表記(国土数値情報の利用規約: 出典の記載+加工した旨)。
 * 地図の下と About の両方に、出典のページと利用規約へのリンクつきで出す。
 */
export function MapCredit({ className }: { className?: string }) {
  const t = useT()
  const link = "text-accent-strong underline underline-offset-2"
  return (
    <p className={className}>
      {t("map.credit")}{" "}
      <a
        href={MAP_SOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={link}
      >
        {t("map.creditSource")}
      </a>{" "}
      <a
        href={MAP_TERMS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={link}
      >
        {t("map.creditTerms")}
      </a>
    </p>
  )
}
