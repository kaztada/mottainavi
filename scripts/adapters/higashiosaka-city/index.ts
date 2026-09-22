import { join } from "node:path"
import { fetchWithCache } from "../../core/fetch-cache"
import { CACHE_DIR } from "../../core/paths"
import type { MunicipalityAdapter } from "../../core/types"
import { resolveCategoryId } from "./category-map"
import { parseHigashiosakaCsv } from "./parse"

/**
 * 東大阪市「ゴミの分別方法一覧」(BODIK オープンデータ、CC BY 4.0、UTF-8 CSV)。
 * 市の品目IDは空欄のため、品目IDは共通パイプラインの id-map で品目名から採番する。
 * 更新時は BODIK のデータセット(272272_28)で新しい CSV の URL を確認して SOURCE_URL を差し替える。
 */
const SOURCE_URL =
  "https://data.bodik.jp/dataset/79c62354-752d-4f88-a63c-168c15481ff9/resource/4e103a30-3af6-43f1-ac71-9c5145844576/download/272272_garbage_separation.csv"
const CACHE_PATH = join(CACHE_DIR, "higashiosaka-city.csv")

export const higashiosakaCityAdapter: MunicipalityAdapter = {
  slug: "higashiosaka-city",
  async fetchSource({ refresh }) {
    const { html, fromCache } = await fetchWithCache(
      SOURCE_URL,
      CACHE_PATH,
      refresh
    )
    return { source: html, fromCache, location: CACHE_PATH }
  },
  parse: parseHigashiosakaCsv,
  resolveCategoryId,
  expectedMinItems: 850,
}
