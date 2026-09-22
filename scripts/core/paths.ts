import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
export const DATA_DIR = join(ROOT, "data")
export const CACHE_DIR = join(DATA_DIR, "cache")
export const REGISTRY_PATH = join(DATA_DIR, "municipalities.json")
export const REUSE_OPTIONS_PATH = join(DATA_DIR, "reuse-options.json")
export const COMMON_ALIASES_PATH = join(DATA_DIR, "aliases.common.json")
export const COMMON_ITEMS_EN_PATH = join(DATA_DIR, "i18n/items.en.json")
export const PUBLIC_DATA_DIR = join(ROOT, "public/data")

/** 対応自治体のデータディレクトリ(data/municipalities/<slug>/) */
export function municipalityDir(slug: string): string {
  return join(DATA_DIR, "municipalities", slug)
}

export function municipalityFile(
  slug: string,
  name:
    | "municipality.json"
    | "categories.json"
    | "items.json"
    | "id-map.json"
    | "aliases.json"
    | "reuse-overrides.json"
    | "items.en.json"
): string {
  return join(municipalityDir(slug), name)
}
