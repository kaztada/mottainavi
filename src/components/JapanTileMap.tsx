"use client"

import { PREF_TILES, TILE_COLS, TILE_ROWS } from "@/lib/japan-tiles"

/**
 * デフォルメ日本地図(screens.md §9)。都道府県のタイルを押すと、その県が選ばれる。
 * 同じことは下のプルダウンでもできるので、タイルはキーボードの移動先にしない(tabIndex -1)。
 * 対応している市がある県は色+太字+下線で示す(色だけに頼らない)。
 */
export function JapanTileMap({
  selected,
  supportedPrefs,
  label,
  onSelect,
}: {
  selected: string
  supportedPrefs: ReadonlySet<string>
  label: string
  onSelect: (pref: string) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid w-full gap-[2px]"
      style={{
        gridTemplateColumns: `repeat(${TILE_COLS}, minmax(0, 1fr))`,
        aspectRatio: `${TILE_COLS} / ${TILE_ROWS}`,
      }}
    >
      {PREF_TILES.map((t) => {
        const isSelected = t.pref === selected
        const isSupported = supportedPrefs.has(t.pref)
        const tone = isSelected
          ? "border-accent-strong bg-accent-strong text-white"
          : isSupported
            ? "border-accent bg-accent-soft font-bold text-accent-strong underline underline-offset-2"
            : "border-border bg-card text-foreground"
        const size =
          t.span > 1
            ? "text-sm"
            : t.label.length >= 3
              ? "text-[8px] min-[420px]:text-[10px] min-[560px]:text-xs"
              : "text-[11px] min-[420px]:text-xs min-[560px]:text-sm"
        return (
          <button
            key={t.pref}
            type="button"
            tabIndex={-1}
            aria-label={t.pref}
            aria-pressed={isSelected}
            onClick={() => onSelect(t.pref)}
            className={`flex items-center justify-center overflow-hidden whitespace-nowrap rounded-md border leading-none active:bg-accent-soft ${tone} ${size}`}
            style={{
              gridColumn: `${t.col + 1} / span ${t.span}`,
              gridRow: `${t.row + 1} / span ${t.span}`,
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
