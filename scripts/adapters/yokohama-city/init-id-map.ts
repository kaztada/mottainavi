/**
 * 横浜市の id-map.json を市の ID から一度だけ初期化する(data-model.md §11)。
 * 品目ID = yok-<市のIDを4桁ゼロ埋め>。以後の採番は共通パイプラインの id-map 機構に任せるので、
 * このスクリプトは初回だけ実行する(既に id-map.json があれば何もしない)。
 *
 * 実行: npx tsx scripts/adapters/yokohama-city/init-id-map.ts
 */
import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { IdMapSchema } from "../../../src/lib/schemas"
import { formatItemId } from "../../core/ids"
import { CACHE_DIR, municipalityFile } from "../../core/paths"
import { readRows } from "./parse"

async function main() {
  const out = municipalityFile("yokohama-city", "id-map.json")
  if (existsSync(out)) {
    console.log(`既に存在するため何もしません: ${out}`)
    return
  }
  const rows = readRows(
    await readFile(join(CACHE_DIR, "yokohama-city.csv"), "utf-8")
  )
  const map: Record<string, string> = {}
  let max = 0
  for (const r of rows) {
    const n = Number(r.id)
    if (!Number.isInteger(n) || n <= 0)
      throw new Error(`市のIDが数値でない: ${r.id} ${r.name}`)
    if (map[r.name]) throw new Error(`品目名が重複: ${r.name}`)
    map[r.name] = formatItemId("yok", n)
    max = Math.max(max, n)
  }
  const idMap = IdMapSchema.parse({ prefix: "yok", next_seq: max + 1, map })
  await writeFile(out, JSON.stringify(idMap, null, 2) + "\n", "utf-8")
  console.log(
    `✓ ${out}: ${Object.keys(map).length} 件, next_seq ${idMap.next_seq}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
