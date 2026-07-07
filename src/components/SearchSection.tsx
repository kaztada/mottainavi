"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type Fuse from "fuse.js"
import type { Category, CategoryId, SearchIndexItem } from "@/lib/schemas"
import type { SearchEntry } from "@/lib/search"
import { useLang, useT } from "@/lib/i18n"
import { SearchBox } from "./SearchBox"
import { ItemCard } from "./ItemCard"
import { CategoryBadge } from "./CategoryBadge"

/** よく調べられるもの(静的チップ)。EN時は英語で検索させる(aliasでヒット) */
const POPULAR: Record<"ja" | "en", string[]> = {
  ja: [
    "ソファー",
    "スプレー缶",
    "モバイルバッテリー",
    "傘",
    "自転車",
    "ペットボトル",
    "エアコン",
    "布団",
  ],
  en: [
    "sofa",
    "spray can",
    "battery",
    "umbrella",
    "bicycle",
    "plastic bottle",
    "air conditioner",
    "futon",
  ],
}

const PAGE_SIZE = 20

/**
 * S1(検索ホーム)/S2(結果リスト)を1画面の状態変化として実装。
 * 検索インデックスとFuse.js本体は初回インタラクション(フォーカス/入力)時に
 * 動的ロードする。初期バンドルとLCPを軽く保つため(tech-stack.md §5)。
 */
export function SearchSection({
  categories,
  officialListUrl,
}: {
  categories: Category[]
  officialListUrl: string
}) {
  const [rawQuery, setRawQuery] = useState("")
  const [query, setQuery] = useState("") // デバウンス後
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | null>(null)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [index, setIndex] = useState<SearchIndexItem[] | null>(null)
  const fuseRef = useRef<Fuse<SearchEntry> | null>(null)
  const { lang } = useLang()
  const t = useT()
  // 検索モジュール(fuse.js含む)。初回インタラクションで動的import
  const searchLibRef = useRef<typeof import("@/lib/search") | null>(null)
  const loadStartedRef = useRef(false)

  const ensureSearchReady = useCallback(() => {
    if (loadStartedRef.current) return
    loadStartedRef.current = true
    Promise.all([
      import("@/lib/search"),
      import("../../data/items/osaka-city.search.json"),
    ]).then(([lib, idx]) => {
      searchLibRef.current = lib
      setIndex(idx.default as SearchIndexItem[])
    })
  }, [])

  // 150msデバウンス
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(rawQuery)
      setLimit(PAGE_SIZE)
    }, 150)
    return () => clearTimeout(t)
  }, [rawQuery])

  const categoriesById = useMemo(
    () => new Map<string, Category>(categories.map((c) => [c.id, c])),
    [categories]
  )

  const results = useMemo(() => {
    const lib = searchLibRef.current
    if (!index || !lib || !query.trim()) return null
    if (!fuseRef.current) {
      fuseRef.current = lib.createFuse(lib.buildSearchEntries(index))
    }
    return lib.searchItems(fuseRef.current, query)
  }, [index, query])

  const filtered = useMemo(() => {
    if (!index || !categoryFilter) return null
    return index.filter((i) => i.c.includes(categoryFilter))
  }, [index, categoryFilter])

  const searching = query.trim().length > 0
  const list = searching ? results : filtered
  // 入力済みだが検索モジュール読み込み中(チップ画面に戻さない)
  const loadingSearch =
    (searching || categoryFilter !== null) && list === null

  return (
    <div className="flex flex-col gap-6">
      <SearchBox
        value={rawQuery}
        onFocus={ensureSearchReady}
        onChange={(v) => {
          ensureSearchReady()
          setRawQuery(v)
          if (v) setCategoryFilter(null)
        }}
      />

      {loadingSearch && (
        <p aria-live="polite" className="text-sm text-muted">
          …
        </p>
      )}

      {/* 結果リスト(検索 or 区分フィルタ) */}
      {list !== null && (
        <section aria-live="polite" className="flex flex-col gap-2.5">
          {categoryFilter && !searching && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">
                {t("search.categoryCount", {
                  category:
                    (lang === "en"
                      ? categoriesById.get(categoryFilter)?.name_en
                      : categoriesById.get(categoryFilter)?.name_ja) ?? "",
                  n: list.length,
                })}
              </p>
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className="text-sm text-accent-strong underline underline-offset-2 px-2 py-2"
              >
                {t("search.clearFilter")}
              </button>
            </div>
          )}
          {list.length === 0 ? (
            <div className="rounded-2xl bg-card border border-border p-5 text-sm leading-relaxed">
              <p>{t("search.noResults")}</p>
              <p className="mt-1 text-muted">
                {t("search.noResultsHint")}{" "}
                <a
                  href={officialListUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-strong underline underline-offset-2"
                >
                  {t("search.officialList")}
                </a>
              </p>
            </div>
          ) : (
            <>
              {list.slice(0, limit).map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  categoriesById={categoriesById}
                />
              ))}
              {list.length > limit && (
                <button
                  type="button"
                  onClick={() => setLimit((n) => n + PAGE_SIZE)}
                  className="mt-1 rounded-2xl border border-border bg-card py-3 text-sm text-accent-strong"
                >
                  {t("search.more", { n: list.length - limit })}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {/* S1: チップと区分一覧(未入力・未フィルタ時のみ) */}
      {list === null && !loadingSearch && (
        <>
          <section>
            <h2 className="mb-2.5 text-sm text-muted">{t("search.popular")}</h2>
            <div className="flex flex-wrap gap-2">
              {POPULAR[lang].map((word) => (
                <button
                  key={word}
                  type="button"
                  onClick={() => {
                    ensureSearchReady()
                    setRawQuery(word)
                  }}
                  className="rounded-full border border-border bg-card px-4 py-2.5 text-sm active:bg-accent-soft"
                >
                  {word}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2.5 text-sm text-muted">
              {t("search.byCategory")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    ensureSearchReady()
                    setCategoryFilter(cat.id)
                  }}
                  className="active:opacity-70"
                >
                  <CategoryBadge category={cat} size="md" />
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
