"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { itemShardUrl } from "@/lib/public-data"
import type {
  Category,
  Item,
  ItemShard,
  Municipality,
  ReuseCategory,
} from "@/lib/schemas"
import { useT } from "@/lib/i18n"
import { ItemDetail } from "./ItemDetail"
import { LangToggle } from "./LangToggle"
import { MunicipalitySwitch } from "./MunicipalitySwitch"
import { RememberMunicipality } from "./RememberMunicipality"
import { SourceNote } from "./SourceNote"

type State =
  | { status: "loading" }
  | { status: "ready"; item: Item }
  | { status: "not-found" }
  | { status: "error" }

/** URL(/<slug>/item/<id>)から品目IDを取り出す。rewrite 後もブラウザのURLを読む */
function itemIdFromLocation(slug: string): string | null {
  const m = window.location.pathname.match(
    new RegExp(`^/${slug}/item/([^/?#]+)/?$`)
  )
  if (!m) return null
  const id = decodeURIComponent(m[1])
  // 配信データはビルド時に zod 検証済み。クライアントには zod を持ち込まない(バンドル削減)
  return /^[a-z0-9]{2,8}-\d{4}$/.test(id) ? id : null
}

/**
 * S3(品目詳細)のクライアント描画シェル(tech-stack.md §9)。
 * 自治体ごとに1枚だけSSGし、品目データは該当シャード1本を fetch して描画する。
 */
export function ItemDetailLoader({
  municipality,
  categories,
  reuseCategories,
}: {
  municipality: Municipality
  categories: Category[]
  reuseCategories: ReuseCategory[]
}) {
  const [state, setState] = useState<State>({ status: "loading" })
  const t = useT()

  useEffect(() => {
    const id = itemIdFromLocation(municipality.slug)
    if (!id) {
      setState({ status: "not-found" })
      return
    }
    let cancelled = false
    fetch(itemShardUrl(municipality.slug, id, municipality.data_version))
      .then((r) => {
        if (!r.ok) throw new Error(`シャードの取得に失敗: ${r.status}`)
        return r.json() as Promise<ItemShard>
      })
      .then((shard) => {
        if (cancelled) return
        const item = shard[id]
        setState(item ? { status: "ready", item } : { status: "not-found" })
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setState({ status: "error" })
      })
    return () => {
      cancelled = true
    }
  }, [municipality.slug, municipality.data_version])

  // 品目別のメタタグは持てないため、タイトルだけはクライアントで設定する
  useEffect(() => {
    if (state.status === "ready") {
      document.title = `${state.item.name_ja}の捨て方・手放し方 | もったいナビ`
    }
  }, [state])

  if (state.status === "ready") {
    const reuseCategory = state.item.reuse_category
      ? (reuseCategories.find((rc) => rc.id === state.item.reuse_category) ??
        null)
      : null
    return (
      <>
        <RememberMunicipality slug={municipality.slug} />
        <ItemDetail
          item={state.item}
          categories={categories}
          municipality={municipality}
          reuseCategory={reuseCategory}
        />
      </>
    )
  }

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

      <main className="flex-1" aria-busy={state.status === "loading"}>
        {state.status === "loading" && (
          <div aria-live="polite">
            <span className="sr-only">{t("item.loading")}</span>
            <div className="h-7 w-2/3 animate-pulse rounded-lg bg-border" />
            <div className="mt-6 h-5 w-1/2 animate-pulse rounded-lg bg-border" />
            <div className="mt-3 h-32 animate-pulse rounded-2xl bg-border/60" />
          </div>
        )}
        {state.status === "not-found" && (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed">
            <h1 className="text-base font-bold">{t("item.notFound")}</h1>
            <p className="mt-1 text-muted">{t("item.notFoundHint")}</p>
            <Link
              href={`/${municipality.slug}`}
              className="mt-3 inline-block text-accent-strong underline underline-offset-2"
            >
              {t("item.back")}
            </Link>
          </div>
        )}
        {state.status === "error" && (
          <p
            role="alert"
            className="rounded-2xl border border-border bg-card p-5 text-sm"
          >
            {t("item.loadError")}
          </p>
        )}
      </main>

      <footer className="mt-10 border-t border-border pt-4">
        <SourceNote municipality={municipality} full />
      </footer>
    </div>
  )
}
