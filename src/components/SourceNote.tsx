"use client"

import type { Municipality } from "@/lib/schemas"
import { useT } from "@/lib/i18n"

/**
 * 出典表記+非公式ツールの断り書き。全ページに常設(CC-BY 4.0 の義務+誤案内リスク対策)。
 * full=true で「最新情報は公式サイトで」の文言と公式リンクを含む(詳細ページ用)。
 */
export function SourceNote({
  municipality,
  full = false,
}: {
  municipality: Municipality
  full?: boolean
}) {
  const t = useT()
  return (
    <div className="text-xs leading-relaxed text-muted">
      {full && (
        <p className="mb-1">
          {t("footer.checkOfficial")}{" "}
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
        {t("footer.unofficial")} {t("footer.attribution")}{" "}
        {t("footer.fetchedAt", { date: municipality.data_fetched_at })}
      </p>
    </div>
  )
}
