import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fetchBinaryWithCache } from "../../core/fetch-cache"
import { CACHE_DIR } from "../../core/paths"
import { readSource } from "../../core/source"
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
 * 取得元の URL は data/municipalities/yokohama-city/source.json。更新は掲載ページのリンクで見張る(scripts/update-data.ts)。
 */
const CACHE_PATH = join(CACHE_DIR, "yokohama-city.csv")
const RAW_CACHE_PATH = join(CACHE_DIR, "yokohama-city.cp932.csv")

export const yokohamaCityAdapter: MunicipalityAdapter = {
  slug: "yokohama-city",
  watch: {
    kind: "page-link",
    pageUrl:
      "https://www.city.yokohama.lg.jp/kurashi/sumai-kurashi/gomi-recycle/gomi/dashikata.html",
    linkText: /ごみと資源物の出し方一覧表.*CSV/,
  },
  async fetchSource({ refresh }) {
    if (!refresh && existsSync(CACHE_PATH)) {
      return {
        source: await readFile(CACHE_PATH, "utf-8"),
        fromCache: true,
        location: CACHE_PATH,
      }
    }
    const { data } = await fetchBinaryWithCache(
      readSource("yokohama-city").file_url,
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
