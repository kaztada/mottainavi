import type { Municipality } from "@/lib/schemas"

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
  return (
    <div className="text-xs leading-relaxed text-muted">
      {full && (
        <p className="mb-1">
          ⓘ 最新・正確な情報は大阪市公式サイトでご確認ください{" "}
          <a
            href={municipality.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-strong underline underline-offset-2"
          >
            公式ページ ↗
          </a>
        </p>
      )}
      <p>
        ⓘ 非公式ツールです。{municipality.source_attribution}
        (データ取得日: {municipality.data_fetched_at})
      </p>
    </div>
  )
}
