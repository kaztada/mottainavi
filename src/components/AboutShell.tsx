"use client"

import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import type { Municipality } from "@/lib/schemas"
import { useT } from "@/lib/i18n"
import { LangToggle } from "./LangToggle"
import { SourceNote } from "./SourceNote"

const GITHUB_ISSUES_URL = "https://github.com/kaztada/tebanashi-navi/issues"
const AUTHOR_URL = "https://kaztada.eco"

function Section({
  heading,
  children,
}: {
  heading: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-base font-bold">{heading}</h2>
      <div className="mt-2 text-sm leading-relaxed text-foreground/85">
        {children}
      </div>
    </section>
  )
}

/** S4: このサイトについて */
export function AboutShell({ municipality }: { municipality: Municipality }) {
  const t = useT()
  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] flex-col px-5 py-6">
      <nav className="mb-4 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-0.5 py-2 pr-3 text-sm text-accent-strong"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {t("item.back")}
        </Link>
        <LangToggle />
      </nav>

      <main className="flex-1">
        <h1 className="mb-5 text-xl font-bold">{t("about.title")}</h1>
        <div className="flex flex-col gap-4">
          <Section heading={t("about.purposeHeading")}>
            <p>{t("about.purposeBody")}</p>
          </Section>

          <Section heading={t("about.unofficialHeading")}>
            <p>{t("about.unofficialBody")}</p>
            <a
              href={municipality.official_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-accent-strong underline underline-offset-2"
            >
              {t("footer.officialPage")}
            </a>
          </Section>

          <Section heading={t("about.sourceHeading")}>
            <p>{t("about.sourceBody")}</p>
            <p className="mt-1 text-muted">
              {t("about.sourceFetched", {
                date: municipality.data_fetched_at,
              })}
            </p>
            <a
              href={municipality.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-accent-strong underline underline-offset-2"
            >
              {t("about.sourceLink")}
            </a>
          </Section>

          <Section heading={t("about.authorHeading")}>
            <p>{t("about.authorBody")}</p>
            <a
              href={AUTHOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-accent-strong underline underline-offset-2"
            >
              {t("about.authorLink")}
            </a>
          </Section>

          <Section heading={t("about.contactHeading")}>
            <p>{t("about.contactBody")}</p>
            <a
              href={GITHUB_ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-accent-strong underline underline-offset-2"
            >
              {t("about.contactLink")}
            </a>
          </Section>
        </div>
      </main>

      <footer className="mt-10 border-t border-border pt-4">
        <SourceNote municipality={municipality} />
      </footer>
    </div>
  )
}
