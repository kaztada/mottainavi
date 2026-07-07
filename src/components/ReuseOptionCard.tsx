"use client"

import type { ReuseOption } from "@/lib/schemas"
import { useLang, useT } from "@/lib/i18n"

// type別の控えめな絵文字(過剰装飾はしない)
const TYPE_EMOJI: Record<ReuseOption["type"], string> = {
  official: "♻️",
  resale: "💰",
  donation: "🎁",
  give: "🤝",
}

/**
 * 手放し選択肢カード。提案であって説教にしない —
 * 軽い見た目(枠なし・淡い背景)で「という手もあります」のトーンを保つ。
 */
export function ReuseOptionCard({ option }: { option: ReuseOption }) {
  const { lang } = useLang()
  const t = useT()
  const title = lang === "en" ? option.title_en : option.title_ja
  const desc = lang === "en" ? option.desc_en : option.desc_ja

  return (
    <div className="rounded-2xl bg-accent-soft/70 p-4">
      <p className="text-sm font-medium leading-snug">
        <span aria-hidden className="mr-1.5">
          {TYPE_EMOJI[option.type]}
        </span>
        {title}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
        {desc}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-card px-2.5 py-0.5 text-xs text-muted">
          {t(`tags.effort.${option.effort}`)}
        </span>
        <span className="rounded-full bg-card px-2.5 py-0.5 text-xs text-muted">
          {t(`tags.money.${option.money}`)}
        </span>
        {option.url && (
          <a
            href={option.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-accent-strong underline underline-offset-2"
          >
            {t("item.detailLink")}
          </a>
        )}
      </div>
    </div>
  )
}
