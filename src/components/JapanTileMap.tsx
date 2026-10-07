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
  lang,
  onSelect,
}: {
  selected: string
  lang: "ja" | "en"
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
        // 文字の大きさはタイルの幅に合わせる(cqw = タイルの内側の幅の 1%)。
        // 3文字の県名(神奈川・和歌山・鹿児島)は、高さを保ったまま横だけ少し詰めて収める。
        // 英語は1行5文字まで(長い名前は2行)なので、5文字が収まる大きさにする
        const chars = t.label.length
        const labelStyle: React.CSSProperties =
          lang === "en"
            ? { fontSize: `min(${t.span > 1 ? 20 : 30}cqw, 14px)` }
            : chars >= 3
              ? {
                  fontSize: `min(${t.span > 1 ? 26 : 36}cqw, 14px)`,
                  transform: t.span > 1 ? undefined : "scaleX(0.85)",
                }
              : { fontSize: "min(44cqw, 14px)" }
        return (
          <button
            key={t.pref}
            type="button"
            tabIndex={-1}
            aria-label={lang === "en" ? t.en : t.pref}
            aria-pressed={isSelected}
            onClick={() => onSelect(t.pref)}
            className={`flex items-center justify-center overflow-hidden whitespace-nowrap rounded-md border leading-none active:bg-accent-soft ${tone}`}
            style={{
              gridColumn: `${t.col + 1} / span ${t.span}`,
              gridRow: `${t.row + 1} / span ${t.span}`,
              containerType: "inline-size",
            }}
          >
            <span style={labelStyle} className="text-center">
              {lang === "en"
                ? t.enLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))
                : t.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
