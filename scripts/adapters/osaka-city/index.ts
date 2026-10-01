import { join } from "node:path"
import { fetchWithCache } from "../../core/fetch-cache"
import { CACHE_DIR } from "../../core/paths"
import { readSource } from "../../core/source"
import type { MunicipalityAdapter } from "../../core/types"
import { resolveCategoryId } from "./category-map"
import { parseItemTables } from "./parse"

/** 大阪市「品目別収集区分一覧表」(CC-BY 4.0、HTML表) */
const SOURCE_URL = "https://www.city.osaka.lg.jp/kankyo/page/0000201907.html"
const CACHE_PATH = join(CACHE_DIR, "osaka-city.html")

export const osakaCityAdapter: MunicipalityAdapter = {
  slug: "osaka-city",
  // 掲載ページ自体がデータ。品目表の中身が変わったかを見る(ページのほかの部分の変更は無視)
  watch: {
    kind: "page-content",
    pageUrl: SOURCE_URL,
    select: (html) => JSON.stringify(parseItemTables(html, SOURCE_URL)),
  },
  async fetchSource({ refresh }) {
    const { html, fromCache } = await fetchWithCache(
      readSource("osaka-city").file_url,
      CACHE_PATH,
      refresh
    )
    return { source: html, fromCache, location: CACHE_PATH }
  },
  parse(source) {
    return parseItemTables(source, SOURCE_URL)
  },
  resolveCategoryId,
  expectedMinItems: 1000,
}
