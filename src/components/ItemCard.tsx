"use client"

import Link from "next/link"
import type { Category, SearchIndexItem } from "@/lib/schemas"
import { useLang, useT } from "@/lib/i18n"
import { CategoryBadge } from "./CategoryBadge"

/** 検索結果リストの1行。品目名+区分バッジ+粗大手数料+♻️インジケータ */
export function ItemCard({
  item,
  slug,
  categoriesById,
}: {
  item: SearchIndexItem
  slug: string
  categoriesById: Map<string, Category>
}) {
  const { lang } = useLang()
  const t = useT()
  const showEn = lang === "en" && item.e

  return (
    <Link
      href={`/${slug}/item/${item.id}`}
      className="block rounded-2xl bg-card border border-border px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:bg-accent-soft transition-colors"
    >
      <p className="font-medium leading-snug">{showEn ? item.e : item.n}</p>
      {showEn && <p className="mt-0.5 text-xs text-muted">{item.n}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {item.c.map((cid) => {
          const cat = categoriesById.get(cid)
          return cat ? <CategoryBadge key={cid} category={cat} /> : null
        })}
        {item.f !== null && (
          <span className="text-xs text-muted">
            {t("item.fee", { n: item.f.toLocaleString() })}
          </span>
        )}
      </div>
      {item.r && (
        <p className="mt-1.5 text-xs text-accent-strong">
          {t("item.reuseAvailable")}
        </p>
      )}
    </Link>
  )
}
