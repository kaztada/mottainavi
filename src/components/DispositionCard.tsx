"use client"

import type { Category, Disposition } from "@/lib/schemas"
import { useLang, useT } from "@/lib/i18n"
import { splitNoteLinks } from "@/lib/note-links"
import { CategoryBadge } from "./CategoryBadge"

/** note中の生URLをリンク化して表示する(URL の切り出しは splitNoteLinks) */
function NoteText({ text }: { text: string }) {
  return (
    <>
      {splitNoteLinks(text).map((part, idx) =>
        part.type === "link" ? (
          <a
            key={idx}
            href={part.value}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-accent-strong underline underline-offset-2"
          >
            {part.value}
          </a>
        ) : (
          <span key={idx}>{part.value}</span>
        )
      )}
    </>
  )
}

/**
 * 捨て方カード(1区分ぶん)。注意文言は原文を全文表示する(欠落させない)。改行も原文どおりに出す(whitespace-pre-line)。
 * 英語モード: 誤訳=誤案内リスクを避けるため定型英文+原文は折りたたみで日本語表示(screens.md §5)。
 */
export function DispositionCard({
  disposition,
  category,
}: {
  disposition: Disposition
  category: Category
}) {
  const { lang } = useLang()
  const t = useT()

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <CategoryBadge category={category} size="md" />
      {lang === "en" ? (
        <>
          <p className="mt-3 text-sm leading-relaxed">
            {t("item.noteTemplate")}
          </p>
          {disposition.note_ja && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted">
                {t("item.showOriginalNote")}
              </summary>
              <p
                className="mt-2 whitespace-pre-line text-sm leading-relaxed"
                lang="ja"
              >
                <NoteText text={disposition.note_ja} />
              </p>
            </details>
          )}
        </>
      ) : (
        disposition.note_ja && (
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
            <NoteText text={disposition.note_ja} />
          </p>
        )
      )}
      {disposition.official_link && (
        <a
          href={disposition.official_link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block w-fit text-sm text-accent-strong underline underline-offset-2"
        >
          {t("item.officialLink")}
        </a>
      )}
    </div>
  )
}
