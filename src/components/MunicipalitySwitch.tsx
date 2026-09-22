"use client"

import Link from "next/link"
import { MapPin } from "lucide-react"
import { useLang, useT } from "@/lib/i18n"
import { CHANGE_MUNICIPALITY_HREF } from "@/lib/municipality-storage"

/** ヘッダの自治体切替(言語トグルの隣)。タップで自治体選択へ(自動転送はしない) */
export function MunicipalitySwitch({
  nameJa,
  nameEn,
}: {
  nameJa: string
  nameEn: string
}) {
  const { lang } = useLang()
  const t = useT()
  const name = lang === "en" ? nameEn : nameJa
  return (
    <Link
      href={CHANGE_MUNICIPALITY_HREF}
      aria-label={t("muni.changeAria", { municipality: name })}
      className="inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border bg-card px-3.5 text-sm font-medium text-accent-strong active:bg-accent-soft"
    >
      <MapPin aria-hidden className="size-4" />
      {t("muni.change", { municipality: name })}
    </Link>
  )
}
