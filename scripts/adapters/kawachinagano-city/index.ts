import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fetchBinaryWithCache } from "../../core/fetch-cache"
import { CACHE_DIR } from "../../core/paths"
import { readSource } from "../../core/source"
import type { MunicipalityAdapter } from "../../core/types"
import { resolveCategoryId } from "./category-map"
import { parseKawachinaganoText } from "./parse"

/**
 * 河内長野市「家庭用ごみの分別辞典」(PDF、市オープンデータ CC BY 4.0)。
 * PDF → テキストは extract_text.py(pypdf)で取り出して data/cache/kawachinagano-city.txt に置く。
 * 取得元の URL は data/municipalities/kawachinagano-city/source.json。更新は市のページのリンクで見張る(検出して知らせるまで)。
 * 市が PDF を更新したら: source.json の file_url を新しい PDF に → `npm run build-data -- --municipality kawachinagano-city --refresh`
 * で PDF を取り直し → extract_text.py を実行 → もう一度 build-data → 切り出しをページ画像と照合。
 */
const PDF_PATH = join(CACHE_DIR, "kawachinagano-city.pdf")
const TXT_PATH = join(CACHE_DIR, "kawachinagano-city.txt")

export const kawachinaganoCityAdapter: MunicipalityAdapter = {
  slug: "kawachinagano-city",
  watch: {
    kind: "page-link",
    pageUrl: "https://www.city.kawachinagano.lg.jp/soshiki/15/1796.html",
    linkText: /家庭用ごみの分別辞典.*PDF/,
  },
  manualUpdateReason:
    "PDF からのテキストの取り出し(extract_text.py)と、切り出し結果のページ画像との照合が必要です",
  async fetchSource({ refresh }) {
    const { fromCache } = await fetchBinaryWithCache(
      readSource("kawachinagano-city").file_url,
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
