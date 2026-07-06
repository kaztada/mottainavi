import Link from "next/link"
import type { Category, SearchIndexItem } from "@/lib/schemas"
import { CategoryBadge } from "./CategoryBadge"

/** 検索結果リストの1行。品目名+区分バッジ+粗大手数料 */
export function ItemCard({
  item,
  categoriesById,
}: {
  item: SearchIndexItem
  categoriesById: Map<string, Category>
}) {
  return (
    <Link
      href={`/item/${item.id}`}
      className="block rounded-2xl bg-card border border-border px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:bg-accent-soft transition-colors"
    >
      <p className="font-medium leading-snug">{item.n}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {item.c.map((cid) => {
          const cat = categoriesById.get(cid)
          return cat ? <CategoryBadge key={cid} category={cat} /> : null
        })}
        {item.f !== null && (
          <span className="text-xs text-muted">
            手数料 {item.f.toLocaleString()}円
          </span>
        )}
      </div>
    </Link>
  )
}
