import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { HomeShell } from "@/components/HomeShell"
import { UnsupportedShell } from "@/components/UnsupportedShell"
import {
  getCategories,
  getMunicipality,
  getRegistry,
  getRegistryEntry,
  getSupportedEntries,
} from "@/lib/data"

type Params = { params: Promise<{ municipality: string }> }

// 全国の市区町村(対応・未対応とも)をSSG。レジストリに無い slug は404
export const dynamicParams = false

export function generateStaticParams() {
  return getRegistry().map((e) => ({ municipality: e.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { municipality } = await params
  const entry = getRegistryEntry(municipality)
  if (!entry) return {}
  if (entry.status !== "supported") {
    // 未対応ページはインデックスさせない(1,700件超の空ページを検索結果に出さない)
    return {
      title: `${entry.name_ja}(未対応) | もったいナビ`,
      robots: { index: false, follow: true },
    }
  }
  return {
    title: `${entry.name_ja}の捨て方・手放し方 | もったいナビ`,
    description: `${entry.name_ja}の「これ、どう手放す?」— 捨て方と、捨てる前の選択肢をまとめて調べられる非公式ナビ`,
    alternates: { canonical: `/${entry.slug}` },
  }
}

export default async function MunicipalityHome({ params }: Params) {
  const { municipality } = await params
  const entry = getRegistryEntry(municipality)
  if (!entry) notFound()

  const supported = getSupportedEntries().map(({ slug, name_ja, name_en }) => ({
    slug,
    name_ja,
    name_en,
  }))

  if (entry.status !== "supported") {
    return <UnsupportedShell entry={entry} supported={supported} />
  }
  return (
    <HomeShell
      categories={getCategories(entry.slug)}
      municipality={getMunicipality(entry.slug)}
    />
  )
}
