import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft, Phone } from "lucide-react"
import { DispositionCard } from "@/components/DispositionCard"
import { ReuseOptionCard } from "@/components/ReuseOptionCard"
import { SourceNote } from "@/components/SourceNote"
import {
  getCategoryById,
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

  const municipality = getMunicipality()
  const hasSodai = item.dispositions.some((d) => d.category_id === "sodai")

  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] flex-col px-5 py-6">
      <nav className="mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-0.5 py-2 pr-3 text-sm text-accent-strong"
        >
          <ChevronLeft className="size-4" aria-hidden />
          検索にもどる
        </Link>
      </nav>

      <main className="flex-1">
        <h1 className="text-xl font-bold leading-snug">{item.name_ja}</h1>

        {/* 手放すが先、捨てるが後(screens.md §5)。ただし軽いカードで押しつけない */}
        {item.reuse_category && (
          <section className="mt-6">
            <h2 className="text-base font-bold">♻️ 捨てる前に、こんな手も</h2>
            <p className="mt-1 text-xs text-muted">
              まだ使えるものなら、こんな選択肢もあります
            </p>
            <div className="mt-3 flex flex-col gap-2.5">
              {getReuseCategoryById(item.reuse_category).options.map(
                (option, idx) => (
                  <ReuseOptionCard key={idx} option={option} />
                )
              )}
            </div>
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-3 text-base font-bold">🗑 大阪市での捨て方</h2>
          <div className="flex flex-col gap-3">
            {item.dispositions.map((d, idx) => (
              <DispositionCard
                key={idx}
                disposition={d}
                category={getCategoryById(d.category_id)}
              />
            ))}
          </div>
        </section>

        {hasSodai && (
          <section className="mt-5 rounded-2xl border border-border bg-accent-soft p-4">
            <h2 className="text-sm font-bold">粗大ごみは事前申込みが必要です</h2>
            {item.sodai_fee_yen !== null && (
              <p className="mt-2 text-sm">
                処理手数料:{" "}
                <span className="text-lg font-bold">
                  {item.sodai_fee_yen.toLocaleString()}円
                </span>
              </p>
            )}
            <div className="mt-3 flex flex-col gap-2">
              <a
                href={municipality.sodai_apply_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl bg-accent-strong py-3 text-center text-sm font-medium text-white"
              >
                ネットで申込む ↗
              </a>
              <div className="flex gap-2">
                <a
                  href={`tel:${municipality.sodai_tel_landline}`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border bg-card py-3 text-sm"
                >
                  <Phone className="size-4 text-accent-strong" aria-hidden />
                  固定電話から
                </a>
                <a
                  href={`tel:${municipality.sodai_tel_mobile}`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border bg-card py-3 text-sm"
                >
                  <Phone className="size-4 text-accent-strong" aria-hidden />
                  携帯電話から
                </a>
              </div>
              <p className="text-xs text-muted">
                固定 {municipality.sodai_tel_landline} / 携帯{" "}
                {municipality.sodai_tel_mobile}(受付センター)
              </p>
            </div>
          </section>
        )}
      </main>

      <footer className="mt-10 border-t border-border pt-4">
        <SourceNote municipality={municipality} full />
      </footer>
    </div>
  )
}
