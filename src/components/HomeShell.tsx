"use client"

import Link from "next/link"
import type { Category, Municipality } from "@/lib/schemas"
import { useT } from "@/lib/i18n"
import { LangToggle } from "./LangToggle"
import { SearchSection } from "./SearchSection"
import { SourceNote } from "./SourceNote"

/** S1/S2画面全体(client)。言語切替に追随する */
export function HomeShell({
  categories,
  municipality,
}: {
  categories: Category[]
  municipality: Municipality
}) {
  const t = useT()
  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] flex-col px-5 py-8">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("app.title")}</h1>
          <p className="mt-1.5 text-sm text-muted">{t("app.tagline")}</p>
        </div>
        <LangToggle />
      </header>

      <main className="flex-1">
        <SearchSection
          categories={categories}
          officialListUrl={municipality.source_url}
        />
      </main>

      <footer className="mt-10 border-t border-border pt-4">
        <SourceNote municipality={municipality} />
        <p className="mt-2">
          <Link
            href="/about"
            className="inline-block py-2 text-xs text-accent-strong underline underline-offset-2"
          >
            {t("footer.about")}
          </Link>
        </p>
      </footer>
    </div>
  )
}
