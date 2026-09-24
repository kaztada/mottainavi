import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fetchBinaryWithCache } from "../../core/fetch-cache"
import { CACHE_DIR } from "../../core/paths"
import type { MunicipalityAdapter } from "../../core/types"
import { resolveCategoryId } from "./category-map"
import { parseHiratsukaCsv } from "./parse"

/**
 * 平塚市「ごみの分別方法一覧」(平塚市オープンデータライブラリ、CC BY 4.0)。
 * 国の標準形式(ごみの分別方法)の CSV で、原本は CP932。キャッシュは UTF-8 に復号したものを置く。
 * 市の品目ID(ff0000000001 等)は連番のため使わず、品目IDは共通パイプラインの id-map で品目名から採番する。
 * 更新時は「暮らし・防災・安全に関するデータセット」のページで新しい CSV の URL を確認して SOURCE_URL を差し替える。
 */
const SOURCE_URL =
  "https://www.city.hiratsuka.kanagawa.jp/common/200203599.csv"
const CACHE_PATH = join(CACHE_DIR, "hiratsuka-city.csv")
const RAW_CACHE_PATH = join(CACHE_DIR, "hiratsuka-city.cp932.csv")

export const hiratsukaCityAdapter: MunicipalityAdapter = {
  slug: "hiratsuka-city",
  async fetchSource({ refresh }) {
    if (!refresh && existsSync(CACHE_PATH)) {
      return {
        source: await readFile(CACHE_PATH, "utf-8"),
        fromCache: true,
        location: CACHE_PATH,
      }
    }
    const { data } = await fetchBinaryWithCache(
      SOURCE_URL,
      RAW_CACHE_PATH,
      refresh
    )
    const source = new TextDecoder("shift_jis").decode(data)
    await writeFile(CACHE_PATH, source, "utf-8")
    return { source, fromCache: false, location: CACHE_PATH }
  },
  parse: parseHiratsukaCsv,
  resolveCategoryId,
  expectedMinItems: 780,
}
