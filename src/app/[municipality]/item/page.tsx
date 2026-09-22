import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ItemDetailLoader } from "@/components/ItemDetailLoader"
import {
  getCategories,
  getMunicipality,
  getRegistryEntry,
  getReuseCategories,
  getSupportedEntries,
} from "@/lib/data"

type Params = { params: Promise<{ municipality: string }> }

/**
 * S3 品目詳細のシェル。/<slug>/item/<id> は next.config.ts の rewrite でここに来る。
 * 対応自治体ごとに1枚だけSSGし、品目はクライアントでシャードから読む(tech-stack.md §9)。
 */
export const dynamicParams = false

export function generateStaticParams() {
  return getSupportedEntries().map((e) => ({ municipality: e.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { municipality } = await params
  const entry = getRegistryEntry(municipality)
  if (!entry) return {}
  return {
    title: `${entry.name_ja}の捨て方・手放し方 | もったいナビ`,
    description: `${entry.name_ja}での分別区分と出し方、捨てる前の選択肢。`,
  }
}

export default async function ItemPage({ params }: Params) {
  const { municipality } = await params
  const entry = getRegistryEntry(municipality)
  if (!entry || entry.status !== "supported") notFound()
  return (
    <ItemDetailLoader
      municipality={getMunicipality(entry.slug)}
      categories={getCategories(entry.slug)}
      reuseCategories={getReuseCategories(entry.slug)}
    />
  )
}
