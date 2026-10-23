/**
 * 1市・数語の検索結果を、変更前(--base)と今で並べて見る。
 * 実行: npx tsx scripts/tools/search-probe.ts <slug> <語> [<語>...] [--base origin/main]
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { relative } from "node:path"
import { toSearchIndex } from "../../src/lib/public-data"
import { createSearcher, searchItems } from "../../src/lib/search"
import { ItemsFileSchema } from "../../src/lib/schemas"
import { municipalityFile, ROOT } from "../core/paths"

const args = process.argv.slice(2)
const bi = args.indexOf("--base")
const base = bi >= 0 ? args[bi + 1] : "origin/main"
const rest = args.filter((_, i) => bi < 0 || (i !== bi && i !== bi + 1))
const [slug, ...words] = rest
const path = municipalityFile(slug as never, "items.json")
const oldText = execFileSync(
  "git",
  ["show", `${base}:${relative(ROOT, path)}`],
  {
    cwd: ROOT,
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
  }
)
const so = createSearcher(
  toSearchIndex(ItemsFileSchema.parse(JSON.parse(oldText)).items)
)
const sn = createSearcher(
  toSearchIndex(
    ItemsFileSchema.parse(JSON.parse(readFileSync(path, "utf-8"))).items
  )
)
const top = (s: typeof so, w: string) =>
  searchItems(s, w)
    .slice(0, 5)
    .map((i) => i.n)
    .join(" / ") || "(0件→公式サイトへ)"
for (const w of words) {
  console.log(`[${slug}] ${w}\n  以前: ${top(so, w)}\n  今:   ${top(sn, w)}`)
}
