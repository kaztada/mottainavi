"use client"

import Link from "next/link"
import {
  BatteryWarning,
  ChevronDown,
  ChevronLeft,
  FileText,
  House,
  Phone,
  Search,
  Smartphone,
  type LucideIcon,
} from "lucide-react"
import {
  formatCheckedAt,
  reasonKey,
  type PublicCoverage,
} from "@/lib/coverage-display"
import {
  formatEdition,
  telHref,
  type GuideKind,
  type PublicGuideLink,
  type PublicGuides,
} from "@/lib/official-guides-display"
import { useLang, useT } from "@/lib/i18n"
import { CHANGE_MUNICIPALITY_HREF } from "@/lib/municipality-storage"
import type { ReuseCategory } from "@/lib/schemas"
import { LangToggle } from "./LangToggle"
import { RememberMunicipality } from "./RememberMunicipality"
import { ReuseOptionCard } from "./ReuseOptionCard"

type Link_ = { slug: string; name_ja: string; name_en: string }

const KIND_ICON: Record<GuideKind, LucideIcon> = {
  search: Search,
  list: FileText,
  app: Smartphone,
  top: House,
}

/**
 * S0': 未対応自治体(screens.md §10)。対応しているふりをしない。
 * 検索UIは置かず(検索できると誤解させないため)、未対応の理由(仕分けの台帳)を添えて、
 * 市の公式の分別の案内(公式への導線)と公式サイトへ案内する。
 * 理由の文は、このアプリが確かめた範囲にとどめる(市を責めない・断定しない)。
 * 並びは「公式の調べ方 → 電池の注意 → 手放す(全国共通)」(この画面だけ。2026-11-04 Kaz 判断)
 */
export function UnsupportedShell({
  entry,
  coverage,
  guides,
  topUrl,
  reuseCategories,
  supported,
}: {
  entry: {
    slug: string
    pref: string
    name_ja: string
    name_en: string
  }
  /** 仕分けの台帳のうち画面に出す項目だけ(根拠・内部のメモは渡さない) */
  coverage: PublicCoverage
  /** 公式への導線と担当課の電話(無ければ null) */
  guides: PublicGuides | null
  /** 確かめた市のトップ(無ければ null) */
  topUrl: string | null
  /** 全国共通の手放し導線だけ */
  reuseCategories: ReuseCategory[]
  supported: Link_[]
}) {
  const { lang } = useLang()
  const t = useT()
  const name = lang === "en" ? entry.name_en : entry.name_ja
  const detail = lang === "en" ? coverage.detail_en : coverage.detail_ja
  const hasGuides = guides !== null && (guides.links.length > 0 || guides.phone !== null)
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
          <p className="mt-1 text-muted">
            {t(reasonKey(coverage.status), { municipality: name })}
          </p>
          {detail && <p className="mt-1 text-muted">{detail}</p>}
          {coverage.checked_at && (
            <p className="mt-2 text-xs text-muted">
              {t("unsupported.checkedAt", {
                date: formatCheckedAt(coverage.checked_at, lang),
              })}
            </p>
          )}
          {!hasGuides && <OfficialButton topUrl={topUrl} name={name} />}
        </section>

        {hasGuides && guides && (
          <section
            aria-labelledby="guides-heading"
            className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed"
          >
            <h2 id="guides-heading" className="font-bold leading-snug">
              {t("guides.heading", { municipality: name })}
            </h2>
            {guides.links.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2.5">
                {guides.links.map((l) => (
                  <GuideLinkItem key={l.kind} link={l} name={name} />
                ))}
              </ul>
            )}
            {guides.phone && (
              <div className="mt-3 rounded-2xl bg-accent-soft/60 p-3.5">
                <p className="flex items-center gap-1.5 font-medium">
                  <Phone className="size-4 shrink-0" aria-hidden />
                  {t("guides.phoneHeading")}
                </p>
                <p className="mt-1">{guides.phone.dept_ja}</p>
                <a
                  href={telHref(guides.phone.tel)}
                  className="mt-0.5 inline-block text-base font-medium text-accent-strong underline underline-offset-2"
                >
                  {guides.phone.tel}
                </a>
                {guides.phone.note_ja && (
                  <span className="ml-1.5 text-xs text-muted">({guides.phone.note_ja})</span>
                )}
                <p className="mt-1 text-xs text-muted">
                  {t("guides.phoneNote", {
                    date: formatCheckedAt(guides.phone.checked_at, lang),
                  })}
                </p>
              </div>
            )}
            <p className="mt-3 text-xs text-muted">
              {t("guides.disclaimer", {
                date: formatCheckedAt(guides.checked_at, lang),
                municipality: name,
              })}
            </p>
            <OfficialButton topUrl={topUrl} name={name} />
          </section>
        )}

        <section
          aria-labelledby="battery-heading"
          className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed"
        >
          <h2 id="battery-heading" className="flex items-center gap-1.5 font-bold">
            <BatteryWarning className="size-4 shrink-0" aria-hidden />
            {t("battery.heading")}
          </h2>
          <p className="mt-1">{t("battery.body")}</p>
        </section>

        {reuseCategories.length > 0 && (
          <details className="group rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-bold">
              <span>{t("unsupported.reuseHeading")}</span>
              <ChevronDown
                className="size-4 shrink-0 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="mt-2 text-muted">{t("unsupported.reuseIntro")}</p>
            <div className="mt-3 flex flex-col gap-4">
              {reuseCategories.map((rc) => (
                <div key={rc.id}>
                  <h3 className="mb-2 text-xs font-medium text-muted">
                    {lang === "en" ? rc.label_en : rc.label_ja}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {rc.options.map((o) => (
                      <ReuseOptionCard key={o.title_ja} option={o} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

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

/** 「公式サイトを見る」(確かめた市のトップ)。無ければ一言 */
function OfficialButton({ topUrl, name }: { topUrl: string | null; name: string }) {
  const t = useT()
  return topUrl ? (
    <a
      href={topUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 block rounded-2xl bg-accent-strong py-3 text-center font-medium text-white"
    >
      {t("unsupported.officialLink", { municipality: name })}
    </a>
  ) : (
    <p className="mt-3">{t("unsupported.noOfficial")}</p>
  )
}

/** 導線1件: 種類(文字+アイコン)・リンク・添え書き(外部のサイト・地区・代表的な品目・版・検索の可否) */
function GuideLinkItem({ link, name }: { link: PublicGuideLink; name: string }) {
  const { lang } = useLang()
  const t = useT()
  const Icon = KIND_ICON[link.kind]
  const isPdfDoc = link.document === "text-pdf" || link.document === "image-pdf"
  const labelKey =
    link.kind === "top"
      ? "guides.doc.top"
      : isPdfDoc && link.target === "html-page"
        ? "guides.doc.pdf-page"
        : `guides.doc.${link.document}`
  const label =
    (lang === "en" ? link.label_en : link.label_ja) ?? t(labelKey, { municipality: name })
  const via = lang === "en" ? link.via_name_en : link.via_name_ja
  const notes: string[] = []
  if (via) notes.push(t("guides.via", { site: via, municipality: name }))
  if (link.scope === "area-selector") notes.push(t("guides.areaSelector"))
  if (link.partial) notes.push(t("guides.partial"))
  if (link.edition) notes.push(formatEdition(link.edition, lang))
  if (link.edition_old) notes.push(t("guides.oldEdition"))
  if (link.document === "image-pdf") notes.push(t("guides.imagePdf"))
  else if (link.searchable && link.document === "text-pdf")
    notes.push(t(link.target === "pdf" ? "guides.searchPdf" : "guides.searchPdfOnPage"))
  return (
    <li className="rounded-2xl bg-accent-soft/60 p-3.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon className="size-4 shrink-0" aria-hidden />
        {t(`guides.kind.${link.kind}`)}
      </p>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 block font-medium text-accent-strong underline underline-offset-2"
      >
        {label}
        {t("guides.japanese")} ↗
      </a>
      {notes.map((n) => (
        <p key={n} className="mt-1 text-xs text-muted">
          {n}
        </p>
      ))}
    </li>
  )
}
