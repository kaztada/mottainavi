import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ItemDetail } from "@/components/ItemDetail"
import {
  getCategories,
  getItemById,
  getItems,
  getMunicipality,
  getReuseCategoryById,
} from "@/lib/data"

// 全品目をビルド時にSSGし、未知IDは404にする
export const dynamicParams = false

export function generateStaticParams() {
  return getItems().map((item) => ({ id: item.id }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const item = getItemById(id)
  if (!item) return {}
  return {
    title: `${item.name_ja}の捨て方・手放し方 | てばなしナビ`,
    description: `大阪市での「${item.name_ja}」の分別区分と出し方、捨てる前の選択肢。`,
  }
}

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const item = getItemById(id)
  if (!item) notFound()

  return (
    <ItemDetail
      item={item}
      categories={getCategories()}
      municipality={getMunicipality()}
      reuseCategory={
        item.reuse_category ? getReuseCategoryById(item.reuse_category) : null
      }
    />
  )
}
