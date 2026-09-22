"use client"

import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { useLang, useT } from "@/lib/i18n"
import { CHANGE_MUNICIPALITY_HREF } from "@/lib/municipality-storage"
import { LangToggle } from "./LangToggle"
import { RememberMunicipality } from "./RememberMunicipality"

type Link_ = { slug: string; name_ja: string; name_en: string }

/**
 * S0': 未対応自治体(screens.md §10)。対応しているふりをしない。
 * 検索UIは置かず(検索できると誤解させないため)、公式サイトへ案内する。
 */
export function UnsupportedShell({
  entry,
  supported,
}: {
  entry: {
    slug: string
    pref: string
    name_ja: string
    name_en: string
    official_url: string | null
  }
  supported: Link_[]
}) {
  const { lang } = useLang()
  const t = useT()
  const name = lang === "en" ? entry.name_en : entry.name_ja
  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] flex-col px-5 py-6">
      <RememberMunicipality slug={entry.slug} />
      <nav className="mb-4 flex items-center justify-between">
        <Link
          href={CHANGE_MUNICIPALITY_HREF}
          className="inline-flex items-center gap-0.5 py-2 pr-3 text-sm text-accent-strong"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {t("unsupported.back")}
        </Link>
        <LangToggle />
      </nav>

      <main className="flex flex-1 flex-col gap-6">
        <div>
          <p className="text-sm text-muted">{entry.pref}</p>
          <h1 className="text-xl font-bold leading-snug">{name}</h1>
        </div>

        <section className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed">
          <p>{t("unsupported.body", { municipality: name })}</p>
          <p className="mt-1 text-muted">{t("unsupported.sorry")}</p>
          {entry.official_url ? (
            <a
              href={entry.official_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 block rounded-2xl bg-accent-strong py-3 text-center font-medium text-white"
            >
              {t("unsupported.officialLink", { municipality: name })}
            </a>
          ) : (
            <p className="mt-3">{t("unsupported.noOfficial")}</p>
          )}
        </section>

        <section>
          <h2 className="mb-2.5 text-sm text-muted">
            {t("unsupported.supportedHeading")}
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
