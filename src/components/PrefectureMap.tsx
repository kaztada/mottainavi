"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useT } from "@/lib/i18n"
import { prefMapUrl } from "@/lib/public-data"

/** 配信する県の地図(scripts/core/map.ts の PrefMap と同じ形) */
interface PrefMapData {
  w: number
  h: number
  m: { s: string; d: string; c: [number, number] }[]
  off: string[]
}

export interface MapMunicipality {
  slug: string
  name: string
  supported: boolean
}

type LoadState =
  | { code: string; status: "ready"; data: PrefMapData }
  | { code: string; status: "error" }

/**
 * 県の市区町村の地図(screens.md §9)。県を選んだときに、その県の分だけ読み込む。
 * 小さい町は押しにくいので、押しただけでは進まない。押した場所の名前を出し、
 * 「〇〇を開く」で確かめてから進む。同じことは下のプルダウンでもできるので、
 * 地図の図形はキーボードの移動先にしない。
 * 対応済みの市区町村は、色+名前のラベルで示す(色だけに頼らない)。
 */
export function PrefectureMap({
  code,
  prefName,
  municipalities,
  version,
}: {
  code: string
  prefName: string
  municipalities: MapMunicipality[]
  version: string
}) {
  const t = useT()
  const [state, setState] = useState<LoadState | null>(null)
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(prefMapUrl(code, version))
      .then((r) => {
        if (!r.ok) throw new Error(`地図の取得に失敗: ${r.status}`)
        return r.json() as Promise<PrefMapData>
      })
      .then((data) => {
        if (!cancelled) setState({ code, status: "ready", data })
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setState({ code, status: "error" })
      })
    return () => {
      cancelled = true
    }
  }, [code, version])

  // 県を切り替えた直後は、前の県の結果を出さない
  const current = state?.code === code ? state : null
  const byslug = new Map(municipalities.map((m) => [m.slug, m]))
  const pickedMuni = picked ? byslug.get(picked) : undefined

  if (current?.status === "error") {
    return <p className="text-sm text-muted">{t("select.muniMapError")}</p>
  }
  if (!current || municipalities.length === 0) {
    return (
      <p className="flex min-h-40 items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted">
        {t("select.loading")}
      </p>
    )
  }

  const { data } = current
  const fontSize = Math.round(data.w / 28)
  return (
    <div className="flex flex-col gap-2.5">
      <svg
        viewBox={`0 0 ${data.w} ${data.h}`}
        role="group"
        aria-label={t("select.muniMapLabel", { pref: prefName })}
        className="w-full touch-manipulation rounded-2xl border border-border bg-card"
      >
        {data.m.map((m) => {
          const muni = byslug.get(m.s)
          if (!muni) return null
          const isPicked = m.s === picked
          return (
            <path
              key={m.s}
              d={m.d}
              role="button"
              tabIndex={-1}
              aria-label={muni.name}
              aria-pressed={isPicked}
              onClick={() => setPicked(m.s)}
              className={`cursor-pointer stroke-[color:var(--muted)] ${
                isPicked
                  ? "fill-accent-strong"
                  : muni.supported
                    ? "fill-accent"
                    : "fill-background"
              }`}
              strokeWidth={isPicked ? 3 : 1}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          )
        })}
        {data.m.map((m) => {
          const muni = byslug.get(m.s)
          if (!muni?.supported) return null
          return (
            <text
              key={m.s}
              x={m.c[0]}
              y={m.c[1]}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              fontWeight={700}
              className="pointer-events-none fill-foreground stroke-card"
              strokeWidth={fontSize / 4}
              paintOrder="stroke"
              aria-hidden
            >
              {muni.name}
            </text>
          )
        })}
      </svg>

      {data.off.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted">{t("select.muniMapOff")}</p>
          <div className="flex flex-wrap gap-1.5">
            {data.off.map((slug) => {
              const muni = byslug.get(slug)
              if (!muni) return null
              const isPicked = slug === picked
              return (
                <button
                  key={slug}
                  type="button"
                  tabIndex={-1}
                  aria-pressed={isPicked}
                  onClick={() => setPicked(slug)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    isPicked
                      ? "border-accent-strong bg-accent-strong text-white"
                      : muni.supported
                        ? "border-accent bg-accent-soft font-bold text-accent-strong"
                        : "border-border bg-card"
                  }`}
                >
                  {muni.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div
        aria-live="polite"
        className="flex min-h-12 flex-wrap items-center justify-between gap-2"
      >
        {pickedMuni ? (
          <>
            <p className="text-base font-bold">
              {pickedMuni.name}
              {!pickedMuni.supported && (
                <span className="text-sm font-normal text-muted">
                  {t("select.unsupportedMark")}
                </span>
              )}
            </p>
            <Link
              href={`/${pickedMuni.slug}`}
              className="rounded-full bg-accent-strong px-5 py-2.5 text-sm font-bold text-white active:opacity-80"
            >
              {t("select.muniMapOpen", { name: pickedMuni.name })}
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted">{t("select.muniMapHint")}</p>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        {t("select.muniMapCredit")}
      </p>
    </div>
  )
}
