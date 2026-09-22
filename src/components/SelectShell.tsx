"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown } from "lucide-react"
import { useLang, useT } from "@/lib/i18n"
import { registryUrl } from "@/lib/public-data"
import { LangToggle } from "./LangToggle"

interface RegistryItem {
  slug: string
  pref: string
  name_ja: string
  name_en: string
  status: "supported" | "unsupported"
}

type SupportedLink = { slug: string; name_ja: string; name_en: string }

const selectClass =
  "w-full min-h-12 appearance-none rounded-2xl border border-border bg-card pl-4 pr-10 text-base text-foreground disabled:text-muted"

/** ネイティブ select に開閉の目印を重ねる(appearance-none で消えるため) */
function SelectFrame({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative block">
      {children}
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3.5 top-1/2 size-5 -translate-y-1/2 text-muted"
      />
    </span>
  )
}

/**
 * S0: 自治体選択(screens.md §9)。都道府県 → 市区町村の2段セレクト。
 * 全国リストは都道府県を選ぶときに初めて fetch する(初期表示を軽く保つ)。
 * 保存済みの自治体がある再訪者は、page.tsx のインラインスクリプトで描画前に転送される。
 */
export function SelectShell({
  prefectures,
  supported,
  registryVersion,
}: {
  prefectures: string[]
  supported: SupportedLink[]
  registryVersion: string
}) {
  const { lang } = useLang()
  const t = useT()
  const router = useRouter()
  const [pref, setPref] = useState("")
  const [registry, setRegistry] = useState<RegistryItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const loadStartedRef = useRef(false)

  const ensureRegistry = useCallback(() => {
    if (loadStartedRef.current) return
    loadStartedRef.current = true
    setLoadError(false)
    fetch(registryUrl(registryVersion))
      .then((r) => {
        if (!r.ok) throw new Error(`自治体一覧の取得に失敗: ${r.status}`)
        return r.json() as Promise<RegistryItem[]>
      })
      .then(setRegistry)
      .catch((err) => {
        console.error(err)
        loadStartedRef.current = false
        setLoadError(true)
      })
  }, [registryVersion])

  const municipalities = useMemo(
    () => (registry && pref ? registry.filter((m) => m.pref === pref) : []),
    [registry, pref]
  )

  const muniDisabled = !pref || registry === null
  const muniPlaceholder = !pref
    ? t("select.muniDisabled")
    : registry === null
      ? t("select.loading")
      : t("select.muniPlaceholder")

  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] flex-col px-5 py-8">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("app.title")}</h1>
          <p className="mt-1.5 text-sm text-muted">{t("select.intro")}</p>
        </div>
        <LangToggle />
      </header>

      <main className="flex flex-1 flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-bold">{t("select.heading")}</h2>
          <label className="flex flex-col gap-1.5 text-sm text-muted">
            {t("select.prefecture")}
            <SelectFrame>
              <select
                className={selectClass}
                value={pref}
                onFocus={ensureRegistry}
                onPointerDown={ensureRegistry}
                onChange={(e) => {
                  ensureRegistry()
                  setPref(e.target.value)
                }}
              >
                <option value="">{t("select.prefPlaceholder")}</option>
                {prefectures.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </SelectFrame>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-muted">
            {t("select.municipality")}
            <SelectFrame>
              <select
                className={selectClass}
                value=""
                disabled={muniDisabled}
                onChange={(e) => {
                  if (e.target.value) router.push(`/${e.target.value}`)
                }}
              >
                <option value="">{muniPlaceholder}</option>
                {municipalities.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {lang === "en" ? m.name_en : m.name_ja}
                    {m.status === "unsupported"
                      ? t("select.unsupportedMark")
                      : ""}
                  </option>
                ))}
              </select>
            </SelectFrame>
          </label>
          {loadError && (
            <p role="alert" className="text-sm text-muted">
              {t("select.loadError")}
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-2.5 text-sm text-muted">
            {t("select.supportedHeading")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {supported.map((m) => (
              <Link
                key={m.slug}
                href={`/${m.slug}`}
                className="rounded-full border border-border bg-card px-4 py-2.5 text-sm active:bg-accent-soft"
              >
                {lang === "en" ? m.name_en : m.name_ja}
              </Link>
            ))}
          </div>
        </section>
      </main>

      <footer className="mt-10 border-t border-border pt-4 text-xs leading-relaxed text-muted">
        <p>{t("footer.unofficial")}</p>
      </footer>
    </div>
  )
}
