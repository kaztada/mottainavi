// サーバ側(SSG)専用のデータ読み込みユーティリティ。
// 自治体データは data/municipalities/<slug>/ からビルド時に読み、zod検証してキャッシュする。
// 品目データはバンドルにもページにも含めない(public/data から fetch する。tech-stack.md §10)。
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  CategoriesFileSchema,
  MunicipalityMetaSchema,
  RegistryFileSchema,
  ReuseCategorySchema,
  type Category,
  type Municipality,
  type RegistryEntry,
  type ReuseCategory,
} from "./schemas"
import { z } from "zod"

const DATA_DIR = join(process.cwd(), "data")

function readJson(...segments: string[]): unknown {
  return JSON.parse(readFileSync(join(DATA_DIR, ...segments), "utf-8"))
}

let registryCache: RegistryEntry[] | null = null
let reuseCache: ReuseCategory[] | null = null
const municipalityCache = new Map<string, Municipality>()
const categoriesCache = new Map<string, Category[]>()

/** 全国レジストリ(1,741件) */
export function getRegistry(): RegistryEntry[] {
  registryCache ??= RegistryFileSchema.parse(readJson("municipalities.json"))
  return registryCache
}

export function getRegistryEntry(slug: string): RegistryEntry | undefined {
  return getRegistry().find((e) => e.slug === slug)
}

/** 対応済み自治体のレジストリ(選択UIのチップ・About用) */
export function getSupportedEntries(): RegistryEntry[] {
  return getRegistry().filter((e) => e.status === "supported")
}

/** 都道府県名の一覧(レジストリの出現順=団体コード順) */
export function getPrefectures(): string[] {
  return [...new Set(getRegistry().map((e) => e.pref))]
}

/** 対応自治体の情報(レジストリ+municipality.json)。未対応・未知の slug はエラー */
export function getMunicipality(slug: string): Municipality {
  const cached = municipalityCache.get(slug)
  if (cached) return cached
  const entry = getRegistryEntry(slug)
  if (!entry || entry.status !== "supported" || !entry.official_url) {
    throw new Error(`対応自治体ではありません: ${slug}`)
  }
  const meta = MunicipalityMetaSchema.parse(
    readJson("municipalities", slug, "municipality.json")
  )
  if (meta.slug !== slug)
    throw new Error(`municipality.json の slug 不一致: ${slug}`)
  const { status: _status, ...rest } = entry
  void _status
  const m: Municipality = { ...rest, ...meta, official_url: entry.official_url }
  municipalityCache.set(slug, m)
  return m
}

/** 自治体の収集区分 */
export function getCategories(slug: string): Category[] {
  const cached = categoriesCache.get(slug)
  if (cached) return cached
  const cats = CategoriesFileSchema.parse(
    readJson("municipalities", slug, "categories.json")
  )
  categoriesCache.set(slug, cats)
  return cats
}

/**
 * その自治体で出してよい手放し導線。
 * municipality_id 付きの選択肢(自治体の公式回収など)は該当自治体でのみ残す。
 * 選択肢が1つも残らないカテゴリは除く。
 */
export function getReuseCategories(slug: string): ReuseCategory[] {
  reuseCache ??= z
    .array(ReuseCategorySchema)
    .parse(readJson("reuse-options.json"))
  return reuseCache
    .map((rc) => ({
      ...rc,
      options: rc.options.filter(
        (o) => !o.municipality_id || o.municipality_id === slug
      ),
    }))
    .filter((rc) => rc.options.length > 0)
}

/** 配信用レジストリのキャッシュバスター(内容のハッシュ。status を変えれば値も変わる) */
export function getRegistryVersion(): string {
  const raw = readFileSync(join(DATA_DIR, "municipalities.json"))
  return createHash("sha1").update(raw).digest("hex").slice(0, 10)
}
