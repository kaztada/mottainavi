import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fetchBinaryWithCache } from "../../core/fetch-cache"
import { CACHE_DIR } from "../../core/paths"
import type { MunicipalityAdapter } from "../../core/types"
import { resolveCategoryId } from "./category-map"
import { parseKawachinaganoText } from "./parse"

/**
 * 河内長野市「家庭用ごみの分別辞典」(PDF、市オープンデータ CC BY 4.0)。
 * PDF → テキストは extract_text.py(pypdf)で取り出して data/cache/kawachinagano-city.txt に置く。
 * 市が PDF を更新したら: SOURCE_URL を差し替え → `npm run build-data -- --municipality kawachinagano-city --refresh`
 * で PDF を取り直し → extract_text.py を実行 → もう一度 build-data。
 */
const SOURCE_URL =
  "https://www.city.kawachinagano.lg.jp/uploaded/attachment/46661.pdf"
const PDF_PATH = join(CACHE_DIR, "kawachinagano-city.pdf")
const TXT_PATH = join(CACHE_DIR, "kawachinagano-city.txt")

export const kawachinaganoCityAdapter: MunicipalityAdapter = {
  slug: "kawachinagano-city",
  async fetchSource({ refresh }) {
    const { fromCache } = await fetchBinaryWithCache(
      SOURCE_URL,
      PDF_PATH,
      refresh
    )
    if (!fromCache || !existsSync(TXT_PATH)) {
      throw new Error(
        `PDF を取得しました。テキストの取り出しを実行してから、もう一度実行してください:\n  python3 scripts/adapters/kawachinagano-city/extract_text.py`
      )
    }
    return {
      source: await readFile(TXT_PATH, "utf-8"),
      fromCache: true,
      location: TXT_PATH,
    }
  },
  parse: parseKawachinaganoText,
  resolveCategoryId,
  expectedMinItems: 1000,
}
