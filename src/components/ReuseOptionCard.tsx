import type { ReuseOption } from "@/lib/schemas"

// type別の控えめな絵文字(過剰装飾はしない)
const TYPE_EMOJI: Record<ReuseOption["type"], string> = {
  official: "♻️",
  resale: "💰",
  donation: "🎁",
  give: "🤝",
}

const EFFORT_LABEL: Record<ReuseOption["effort"], string> = {
  low: "手間: 少なめ",
  medium: "手間: ふつう",
  high: "手間: 多め",
}

const MONEY_LABEL: Record<ReuseOption["money"], string> = {
  free: "お金: 無料",
  earn: "お金: 入るかも",
  cost: "お金: かかる",
}

/**
 * 手放し選択肢カード。提案であって説教にしない —
 * 軽い見た目(枠なし・淡い背景)で「という手もあります」のトーンを保つ。
 */
export function ReuseOptionCard({ option }: { option: ReuseOption }) {
  return (
    <div className="rounded-2xl bg-accent-soft/70 p-4">
      <p className="text-sm font-medium leading-snug">
        <span aria-hidden className="mr-1.5">
          {TYPE_EMOJI[option.type]}
        </span>
        {option.title_ja}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
        {option.desc_ja}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-card px-2.5 py-0.5 text-xs text-muted">
          {EFFORT_LABEL[option.effort]}
        </span>
        <span className="rounded-full bg-card px-2.5 py-0.5 text-xs text-muted">
          {MONEY_LABEL[option.money]}
        </span>
        {option.url && (
          <a
            href={option.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-accent-strong underline underline-offset-2"
          >
            くわしく ↗
          </a>
        )}
      </div>
    </div>
  )
}
