// サーバ側(SSG)専用のデータ読み込みユーティリティ。
// JSONはビルド時にzod検証し、モジュールスコープでキャッシュする。
import {
  CategorySchema,
  ItemsFileSchema,
  MunicipalitySchema,
  ReuseCategorySchema,
  type Category,
  type CategoryId,
  type Item,
  type ItemsFile,
  type Municipality,
  type ReuseCategory,
  type ReuseCategoryId,
} from "./schemas"
import { z } from "zod"

import itemsFileRaw from "../../data/items/osaka-city.json"
import categoriesRaw from "../../data/categories.json"
import municipalitiesRaw from "../../data/municipalities.json"
import reuseOptionsRaw from "../../data/reuse-options.json"

const itemsFile: ItemsFile = ItemsFileSchema.parse(itemsFileRaw)
const categories: Category[] = z.array(CategorySchema).parse(categoriesRaw)
const municipalities: Municipality[] = z
  .array(MunicipalitySchema)
  .parse(municipalitiesRaw)

const reuseCategories: ReuseCategory[] = z
  .array(ReuseCategorySchema)
  .parse(reuseOptionsRaw)

const itemsById = new Map(itemsFile.items.map((i) => [i.id, i]))
const categoriesById = new Map(categories.map((c) => [c.id, c]))
const reuseById = new Map(reuseCategories.map((r) => [r.id, r]))

export function getItems(): Item[] {
  return itemsFile.items
}

export function getItemById(id: string): Item | undefined {
  return itemsById.get(id)
}

export function getCategories(): Category[] {
  return categories
}

export function getCategoryById(id: CategoryId): Category {
  const cat = categoriesById.get(id)
  if (!cat) throw new Error(`未知の区分ID: ${id}`)
  return cat
}

export function getReuseCategoryById(id: ReuseCategoryId): ReuseCategory {
  const rc = reuseById.get(id)
  if (!rc) throw new Error(`未知のreuse_category: ${id}`)
  return rc
}

/** MVPは大阪市のみ */
export function getMunicipality(): Municipality {
  return municipalities[0]
}
