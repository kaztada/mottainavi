import { join } from "node:path"
import { fetchBinaryWithCache } from "../../core/fetch-cache"
import { CACHE_DIR } from "../../core/paths"
import { readSource } from "../../core/source"
import type { MunicipalityAdapter } from "../../core/types"
import { resolveCategoryId } from "./category-map"
import { readHirakataWorkbook } from "./excel"
import { parseHirakataJson } from "./parse"

/**
 * 枚方市「ごみの分別一覧表50音順オープンデータ」(xlsm、CC BY 2.1)。
 * Excel の読み込みは非同期なので fetchSource で行の JSON にしてから渡す(アダプタ契約の parse は同期)。
 * 市の品目IDは無いため、品目IDは共通パイプラインの id-map で品目名から採番する。
 * 取得元の URL は data/municipalities/hirakata-city/source.json。更新は市のページ(0000024067)のリンクで見張る(scripts/update-data.ts)。
 */
const CACHE_PATH = join(CACHE_DIR, "hirakata-city.xlsm")

export const hirakataCityAdapter: MunicipalityAdapter = {
  slug: "hirakata-city",
  watch: {
    kind: "page-link",
    pageUrl: "https://www.city.hirakata.osaka.jp/0000024067.html",
    linkText: /ごみの分別一覧表50音順オープンデータ/,
  },
  async fetchSource({ refresh }) {
    const { data, fromCache } = await fetchBinaryWithCache(
      readSource("hirakata-city").file_url,
      CACHE_PATH,
      refresh
    )
    const rows = await readHirakataWorkbook(data)
    return { source: JSON.stringify(rows), fromCache, location: CACHE_PATH }
  },
  parse: parseHirakataJson,
  resolveCategoryId,
  expectedMinItems: 1600,
}
