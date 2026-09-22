import type { Metadata } from "next"
import { SelectShell } from "@/components/SelectShell"
import {
  getPrefectures,
  getRegistryVersion,
  getSupportedEntries,
} from "@/lib/data"
import { AUTO_REDIRECT_SCRIPT } from "@/lib/municipality-storage"

export const metadata: Metadata = {
  title: "もったいナビ",
  alternates: { canonical: "/" },
}

/** S0: 自治体選択。保存済みの自治体があれば描画前にそのページへ直行する */
export default function Home() {
  const supported = getSupportedEntries().map(({ slug, name_ja, name_en }) => ({
    slug,
    name_ja,
    name_en,
  }))
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: AUTO_REDIRECT_SCRIPT }} />
      <SelectShell
        prefectures={getPrefectures()}
        supported={supported}
        registryVersion={getRegistryVersion()}
      />
    </>
  )
}
