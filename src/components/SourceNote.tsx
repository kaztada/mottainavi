"use client"

import type { Municipality } from "@/lib/schemas"
import { useLang, useT } from "@/lib/i18n"

/**
 * 出典表記+非公式ツールの断り書き。全ページに常設(CC-BY 等の義務+誤案内リスク対策)。
 * 出典は自治体ごとに異なるため municipality.json の source_attribution を使う。
 * full=true で「最新情報は公式サイトで」の文言と公式リンクを含む(詳細ページ用)。
 */
export function SourceNote({
  municipality,
  full = false,
}: {
  municipality: Municipality
  full?: boolean
}) {
  const { lang } = useLang()
  const t = useT()
  const name = lang === "en" ? municipality.name_en : municipality.name_ja
  const attribution =
    lang === "en"
      ? municipality.source_attribution_en
      : municipality.source_attribution
  return (
    <div className="text-xs leading-relaxed text-muted">
      {full && (
        <p className="mb-1">
          {t("footer.checkOfficial", { municipality: name })}{" "}
          <a
            href={municipality.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-strong underline underline-offset-2"
          >
            {t("footer.officialPage")}
          </a>
        </p>
      )}
      <p>
        {t("footer.unofficial")} {attribution}{" "}
        {t("footer.fetchedAt", { date: municipality.data_fetched_at })}
      </p>
    </div>
  )
}
