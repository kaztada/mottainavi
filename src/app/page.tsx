import { SearchSection } from "@/components/SearchSection"
import { SourceNote } from "@/components/SourceNote"
import { getCategories, getMunicipality } from "@/lib/data"

export default function Home() {
  const categories = getCategories()
  const municipality = getMunicipality()

  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] flex-col px-5 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">🌱 てばなしナビ</h1>
        <p className="mt-1.5 text-sm text-muted">
          大阪市の「これ、どう手放す?」— 捨て方と、捨てる前の選択肢を
        </p>
      </header>

      <main className="flex-1">
        <SearchSection
          categories={categories}
          officialListUrl={municipality.source_url}
        />
      </main>

      <footer className="mt-10 border-t border-border pt-4">
        <SourceNote municipality={municipality} />
      </footer>
    </div>
  )
}
