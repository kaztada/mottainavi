import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fetchBinaryWithCache } from "../../core/fetch-cache"
import { CACHE_DIR } from "../../core/paths"
import type { MunicipalityAdapter } from "../../core/types"
import {
  KOGATA_BOX_LABEL,
  LABEL_TO_ID,
  resolveCategoryId,
} from "./category-map"
import { parseYokohamaCsv } from "./parse"

/**
 * 横浜市「ごみと資源物の出し方一覧表」(オープンデータ、CC BY 4.0)。
 * 原本は CP932 の CSV。キャッシュは UTF-8 に復号したものを置く(data/cache/yokohama-city.csv)。
 * 更新時は横浜市オープンデータポータルで新しい CSV の URL を確認して SOURCE_URL を差し替える。
 */
const SOURCE_URL =
  "https://www.city.yokohama.lg.jp/kurashi/sumai-kurashi/gomi-recycle/gomi/dashikata.files/0141_20260209.csv"
const CACHE_PATH = join(CACHE_DIR, "yokohama-city.csv")
const RAW_CACHE_PATH = join(CACHE_DIR, "yokohama-city.cp932.csv")

export const yokohamaCityAdapter: MunicipalityAdapter = {
  slug: "yokohama-city",
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
  parse: parseYokohamaCsv,
  resolveCategoryId(label) {
    // 合成した回収ボックス行のラベルも解決できるようにする
    if (label === KOGATA_BOX_LABEL) return "kogata-box"
    return resolveCategoryId(label)
  },
  expectedMinItems: 3000,
}

export { LABEL_TO_ID }
