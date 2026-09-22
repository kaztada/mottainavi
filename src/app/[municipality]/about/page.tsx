import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AboutShell } from "@/components/AboutShell"
import {
  getMunicipality,
  getRegistryEntry,
  getSupportedEntries,
} from "@/lib/data"

type Params = { params: Promise<{ municipality: string }> }

export const dynamicParams = false

export function generateStaticParams() {
  return getSupportedEntries().map((e) => ({ municipality: e.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { municipality } = await params
  const entry = getRegistryEntry(municipality)
  if (!entry) return {}
  return {
    title: "このサイトについて | もったいナビ",
    description: `もったいナビは、${entry.name_ja}などのごみ分別検索に「捨てる前の選択肢」を添えた非公式ツールです。出典・ライセンス・運営者について。`,
  }
}

export default async function AboutPage({ params }: Params) {
  const { municipality } = await params
  const entry = getRegistryEntry(municipality)
  if (!entry || entry.status !== "supported") notFound()
  const supported = getSupportedEntries().map(({ name_ja, name_en }) => ({
    name_ja,
    name_en,
  }))
  return (
    <AboutShell
      municipality={getMunicipality(entry.slug)}
      supported={supported}
    />
  )
}
