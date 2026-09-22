import { join } from "node:path"
import { fetchBinaryWithCache } from "../../core/fetch-cache"
import { CACHE_DIR } from "../../core/paths"
import type { MunicipalityAdapter } from "../../core/types"
import { resolveCategoryId } from "./category-map"
import { readHirakataWorkbook } from "./excel"
import { parseHirakataJson } from "./parse"

/**
 * 枚方市「ごみの分別一覧表50音順オープンデータ」(xlsm、CC BY 2.1)。
 * Excel の読み込みは非同期なので fetchSource で行の JSON にしてから渡す(アダプタ契約の parse は同期)。
 * 市の品目IDは無いため、品目IDは共通パイプラインの id-map で品目名から採番する。
 * 更新時は市のページ(0000024067)で新しいファイルの URL を確認して SOURCE_URL を差し替える。
 */
const SOURCE_URL =
  "https://www.city.hirakata.osaka.jp/cmsfiles/contents/0000024/24067/gomibunbetuichiranopendata_260819.xlsm"
const CACHE_PATH = join(CACHE_DIR, "hirakata-city.xlsm")

export const hirakataCityAdapter: MunicipalityAdapter = {
  slug: "hirakata-city",
  async fetchSource({ refresh }) {
    const { data, fromCache } = await fetchBinaryWithCache(
      SOURCE_URL,
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
