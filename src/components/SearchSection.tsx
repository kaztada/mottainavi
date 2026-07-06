"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type Fuse from "fuse.js"
import type { Category, CategoryId, SearchIndexItem } from "@/lib/schemas"
import {
  buildSearchEntries,
  createFuse,
  searchItems,
  type SearchEntry,
} from "@/lib/search"
import { SearchBox } from "./SearchBox"
import { ItemCard } from "./ItemCard"
import { CategoryBadge } from "./CategoryBadge"

/** よく調べられるもの(静的チップ) */
const POPULAR = [
  "ソファー",
  "スプレー缶",
  "モバイルバッテリー",
  "傘",
  "自転車",
  "ペットボトル",
  "エアコン",
  "布団",
]

const PAGE_SIZE = 20

/**
 * S1(検索ホーム)/S2(結果リスト)を1画面の状態変化として実装。
 * 検索インデックスは初回マウント時に遅延ロードし、Fuseも遅延構築する。
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

  // 軽量インデックスの遅延ロード(初期表示を軽く保つ)
  useEffect(() => {
    let cancelled = false
    import("../../data/items/osaka-city.search.json").then((mod) => {
      if (!cancelled) setIndex(mod.default as SearchIndexItem[])
    })
    return () => {
      cancelled = true
    }
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
    if (!index || !query.trim()) return null
    if (!fuseRef.current) {
      fuseRef.current = createFuse(buildSearchEntries(index))
    }
    return searchItems(fuseRef.current, query)
  }, [index, query])

  const filtered = useMemo(() => {
    if (!index || !categoryFilter) return null
    return index.filter((i) => i.c.includes(categoryFilter))
  }, [index, categoryFilter])

  const searching = query.trim().length > 0
  const list = searching ? results : filtered

  return (
    <div className="flex flex-col gap-6">
      <SearchBox
        value={rawQuery}
        onChange={(v) => {
          setRawQuery(v)
          if (v) setCategoryFilter(null)
        }}
      />

      {/* 結果リスト(検索 or 区分フィルタ) */}
      {list !== null && (
        <section aria-live="polite" className="flex flex-col gap-2.5">
          {categoryFilter && !searching && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">
                {categoriesById.get(categoryFilter)?.name_ja}の品目(
                {list.length}件)
              </p>
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className="text-sm text-accent-strong underline underline-offset-2 px-2 py-2"
              >
                解除
              </button>
            </div>
          )}
          {list.length === 0 ? (
            <div className="rounded-2xl bg-card border border-border p-5 text-sm leading-relaxed">
              <p>見つかりませんでした。</p>
              <p className="mt-1 text-muted">
                別の言い方(ひらがな・カタカナ・別名)で試すか、大阪市の一覧表もどうぞ →{" "}
                <a
                  href={officialListUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-strong underline underline-offset-2"
                >
                  公式の品目一覧表
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
                  もっと見る(あと{list.length - limit}件)
                </button>
              )}
            </>
          )}
        </section>
      )}

      {/* S1: チップと区分一覧(未入力・未フィルタ時のみ) */}
      {list === null && (
        <>
          <section>
            <h2 className="mb-2.5 text-sm text-muted">よく調べられるもの</h2>
            <div className="flex flex-wrap gap-2">
              {POPULAR.map((word) => (
                <button
                  key={word}
                  type="button"
                  onClick={() => setRawQuery(word)}
                  className="rounded-full border border-border bg-card px-4 py-2.5 text-sm active:bg-accent-soft"
                >
                  {word}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2.5 text-sm text-muted">収集区分から見る</h2>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
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
