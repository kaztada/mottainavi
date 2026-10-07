/**
 * 配信データの導出(prebuild)。data/ の原本から public/data/ を毎回作り直す(git管理外)。
 *   public/data/municipalities.json         全国レジストリ(自治体選択UI用)
 *   public/data/<slug>/search.json          検索インデックス
 *   public/data/<slug>/items/NN.json        詳細データのシャード
 *   public/data/map/pref-NN.json            県ごとの市区町村の地図(自治体選択UI用)
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

import {
  SHARD_COUNT,
  shardFileName,
  toSearchIndex,
  toShards,
} from "../src/lib/public-data"
import {
  ItemsFileSchema,
  MunicipalityMetaSchema,
  RegistryFileSchema,
  SearchIndexFileSchema,
} from "../src/lib/schemas"
import { buildAllPrefMaps, type Topology } from "./core/map"
import {
  MAP_SOURCE_PATH,
  PUBLIC_DATA_DIR,
  REGISTRY_PATH,
  municipalityFile,
} from "./core/paths"

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf-8"))
}

async function main() {
  const registry = RegistryFileSchema.parse(await readJson(REGISTRY_PATH))

  await rm(PUBLIC_DATA_DIR, { recursive: true, force: true })
  await mkdir(PUBLIC_DATA_DIR, { recursive: true })

  // 選択UI用は必要な列だけ(改行なし=サイズ優先)
  const slim = registry.map(({ slug, pref, name_ja, name_en, status }) => ({
    slug,
    pref,
    name_ja,
    name_en,
    status,
  }))
  await writeFile(
    join(PUBLIC_DATA_DIR, "municipalities.json"),
    JSON.stringify(slim)
  )

  const supported = registry.filter((e) => e.status === "supported")
  for (const entry of supported) {
    const slug = entry.slug
    const meta = MunicipalityMetaSchema.parse(
      await readJson(municipalityFile(slug, "municipality.json"))
    )
    const itemsFile = ItemsFileSchema.parse(
      await readJson(municipalityFile(slug, "items.json"))
    )
    if (meta.slug !== slug || itemsFile.municipality_id !== slug) {
      throw new Error(
        `slug の不一致: registry=${slug} meta=${meta.slug} items=${itemsFile.municipality_id}`
      )
    }

    const dir = join(PUBLIC_DATA_DIR, slug)
    await mkdir(join(dir, "items"), { recursive: true })

    const index = SearchIndexFileSchema.parse(toSearchIndex(itemsFile.items))
    await writeFile(join(dir, "search.json"), JSON.stringify(index))

    const shards = toShards(itemsFile.items)
    for (let s = 0; s < SHARD_COUNT; s++) {
      await writeFile(
        join(dir, "items", shardFileName(s)),
        JSON.stringify(shards[s])
      )
    }
    console.log(
      `✓ public/data/${slug}: 検索 ${index.length} 件 / シャード ${SHARD_COUNT} 本`
    )
  }
  console.log(
    `✓ public/data/municipalities.json: ${registry.length} 自治体(対応 ${supported.length})`
  )

  // 市区町村の地図(県を選んだときだけ読む)。境界データに無い自治体があればここで止まる
  const { maps } = buildAllPrefMaps(
    (await readJson(MAP_SOURCE_PATH)) as Topology,
    registry
  )
  await mkdir(join(PUBLIC_DATA_DIR, "map"), { recursive: true })
  let mapBytes = 0
  for (const [code, map] of maps) {
    const json = JSON.stringify(map)
    mapBytes += json.length
    await writeFile(join(PUBLIC_DATA_DIR, "map", `pref-${code}.json`), json)
  }
  console.log(
    `✓ public/data/map: ${maps.size} 都道府県(合計 ${Math.round(mapBytes / 1024)} KB)`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
