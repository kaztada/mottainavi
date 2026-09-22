"use client"

import Link from "next/link"
import { ChevronLeft, Phone } from "lucide-react"
import type { Category, Item, Municipality, ReuseCategory } from "@/lib/schemas"
import { useLang, useT } from "@/lib/i18n"
import { DispositionCard } from "./DispositionCard"
import { LangToggle } from "./LangToggle"
import { MunicipalitySwitch } from "./MunicipalitySwitch"
import { ReuseOptionCard } from "./ReuseOptionCard"
import { SourceNote } from "./SourceNote"

/** S3画面の本体(client)。品目データは ItemDetailLoader がシャードから取得して渡す */
export function ItemDetail({
  item,
  categories,
  municipality,
  reuseCategory,
}: {
  item: Item
  categories: Category[]
  municipality: Municipality
  reuseCategory: ReuseCategory | null
}) {
  const { lang } = useLang()
  const t = useT()
  const categoriesById = new Map(categories.map((c) => [c.id, c]))
  // 粗大ごみの判定は区分IDではなく kind で行う(区分名・IDは自治体ごとに違う)
  const hasBulky = item.dispositions.some(
    (d) => categoriesById.get(d.category_id)?.kind === "bulky"
  )
  // 申込先が1つも登録されていない自治体では申込セクションを出さない
  const hasSodaiContact = Boolean(
    municipality.sodai_apply_url ||
    municipality.sodai_tel_landline ||
    municipality.sodai_tel_mobile
  )
  const muniName = lang === "en" ? municipality.name_en : municipality.name_ja
  // 英語モードの品目名: name_en 優先。無ければ日本語名+ローマ字かな(screens.md §5)
  const showEn = lang === "en"

  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] flex-col px-5 py-6">
      <nav className="mb-4 flex flex-wrap items-center justify-between gap-y-2">
        <Link
          href={`/${municipality.slug}`}
          className="inline-flex items-center gap-0.5 py-2 pr-3 text-sm text-accent-strong"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {t("item.back")}
        </Link>
        <div className="ml-auto flex shrink-0 gap-2">
          <MunicipalitySwitch
            nameJa={municipality.name_ja}
            nameEn={municipality.name_en}
          />
          <LangToggle />
        </div>
      </nav>

      <main className="flex-1">
        {showEn && item.name_en ? (
          <>
            <h1 className="text-xl font-bold leading-snug">{item.name_en}</h1>
            <p className="mt-1 text-sm text-muted" lang="ja">
              {item.name_ja}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold leading-snug" lang="ja">
              {item.name_ja}
            </h1>
            {showEn && (
              <p className="mt-1 text-sm text-muted">{item.name_romaji}</p>
            )}
          </>
        )}

        {/* 手放すが先、捨てるが後(screens.md §5)。ただし軽いカードで押しつけない */}
        {reuseCategory && (
          <section className="mt-6">
            <h2 className="text-base font-bold">{t("item.reuseHeading")}</h2>
            <p className="mt-1 text-xs text-muted">{t("item.reuseIntro")}</p>
            <div className="mt-3 flex flex-col gap-2.5">
              {reuseCategory.options.map((option, idx) => (
                <ReuseOptionCard key={idx} option={option} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-3 text-base font-bold">
            {t("item.disposalHeading", { municipality: muniName })}
          </h2>
          <div className="flex flex-col gap-3">
            {item.dispositions.map((d, idx) => {
              const cat = categoriesById.get(d.category_id)
              return cat ? (
                <DispositionCard key={idx} disposition={d} category={cat} />
              ) : null
            })}
          </div>
        </section>

        {hasBulky && hasSodaiContact && (
          <section className="mt-5 rounded-2xl border border-border bg-accent-soft p-4">
            <h2 className="text-sm font-bold">{t("item.sodaiHeading")}</h2>
            {item.sodai_fee_yen !== null && (
              <p className="mt-2 text-sm">
                {t("item.sodaiFee")}{" "}
                <span className="text-lg font-bold">
                  {item.sodai_fee_yen.toLocaleString()}
                  {lang === "en" ? " yen" : "円"}
                </span>
              </p>
            )}
            <div className="mt-3 flex flex-col gap-2">
              {municipality.sodai_apply_url && (
                <a
                  href={municipality.sodai_apply_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl bg-accent-strong py-3 text-center text-sm font-medium text-white"
                >
                  {t("item.applyOnline")}
                </a>
              )}
              {(municipality.sodai_tel_landline ||
                municipality.sodai_tel_mobile) && (
                <div className="flex gap-2">
                  {municipality.sodai_tel_landline && (
                    <a
                      href={`tel:${municipality.sodai_tel_landline}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border bg-card py-3 text-sm"
                    >
                      <Phone
                        className="size-4 text-accent-strong"
                        aria-hidden
                      />
                      {t("item.telLandline")}
                    </a>
                  )}
                  {municipality.sodai_tel_mobile && (
                    <a
                      href={`tel:${municipality.sodai_tel_mobile}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border bg-card py-3 text-sm"
                    >
                      <Phone
                        className="size-4 text-accent-strong"
                        aria-hidden
                      />
                      {t("item.telMobile")}
                    </a>
                  )}
                </div>
              )}
              {municipality.sodai_tel_landline &&
                municipality.sodai_tel_mobile && (
                  <p className="text-xs text-muted">
                    {t("item.telNote", {
                      landline: municipality.sodai_tel_landline,
                      mobile: municipality.sodai_tel_mobile,
                    })}
                  </p>
                )}
            </div>
          </section>
        )}
      </main>

      <footer className="mt-10 border-t border-border pt-4">
        <SourceNote municipality={municipality} full />
      </footer>
    </div>
  )
}
