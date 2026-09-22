/**
 * 全国レジストリ(data/municipalities.json)を生成する(data-model.md §8)。
 * 出典: 総務省「全国地方公共団体コード」の「都道府県コード及び市区町村コード」(Excel)。
 * 取得は1回だけ行い data/cache/ にキャッシュする。
 *
 * 実行: npx tsx scripts/build-registry.ts [--refresh]
 *
 * 既存の municipalities.json がある場合、団体コード(lg_code)が一致するエントリの
 * slug / status / official_url は引き継ぐ(手で保守した値とURLを壊さないため)。
 */
import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import ExcelJS from "exceljs"

import { RegistryFileSchema, type RegistryEntry } from "../src/lib/schemas"
import { fetchBinaryWithCache } from "./core/fetch-cache"
import { CACHE_DIR, REGISTRY_PATH } from "./core/paths"
import { municipalityNameEn, municipalitySlug, prefectureSlugPart } from "./registry/slug"

const SOURCE_URL = "https://www.soumu.go.jp/main_content/000925835.xlsx"
const CACHE_PATH = join(CACHE_DIR, "soumu-lg-code.xlsx")

/**
 * 北方領土の6村(色丹村・泊村・留夜別村・留別村・紗那村・蘂取村)。
 * 団体コードはあるが行政事務を行っていないため対象外(市町村1,718+特別区23=1,741件にそろえる)
 */
const EXCLUDED_CODES = new Set(["016951", "016969", "016977", "016985", "016993", "017001"])

/**
 * 同じ都道府県内で読みまで同じため、都道府県の前置でも区別できない自治体の手動slug。
 * 北海道の振興局名で区別する。
 */
const SLUG_OVERRIDES: Record<string, string> = {
  "013617": "hokkaido-hiyama-esashi-town", // 江差町(檜山振興局)
  "015148": "hokkaido-soya-esashi-town", // 枝幸町(宗谷総合振興局)
}

interface SourceRow {
  lg_code: string
  pref: string
  name_ja: string
  pref_kana: string
  kana: string
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("").trim()
  return String(v).trim()
}

async function readSourceRows(data: Buffer): Promise<SourceRow[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data as unknown as ArrayBuffer)
  // 1枚目: 都道府県・市区町村(政令市の行政区は別シート)
  const ws = wb.worksheets[0]
  const rows: SourceRow[] = []
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return // 見出し行
    const [code, pref, name, prefKana, kana] = [1, 2, 3, 4, 5].map((i) => cellText(row.getCell(i).value))
    if (!/^\d{6}$/.test(code)) return
    if (!name) return // 都道府県の行
    if (EXCLUDED_CODES.has(code)) return
    rows.push({ lg_code: code, pref, name_ja: name, pref_kana: prefKana, kana })
  })
  return rows
}

async function main() {
  const refresh = process.argv.includes("--refresh")
  const { data, fromCache } = await fetchBinaryWithCache(SOURCE_URL, CACHE_PATH, refresh)
  console.log(fromCache ? `✓ fetch: キャッシュ使用 (${CACHE_PATH})` : `✓ fetch: 総務省から取得しキャッシュ保存 (${CACHE_PATH})`)

  const rows = await readSourceRows(data)
  console.log(`✓ parse: ${rows.length} 市区町村`)

  // 既存レジストリ(手で保守した値)を lg_code で引けるように
  const existing = new Map<string, RegistryEntry>()
  if (existsSync(REGISTRY_PATH)) {
    const parsed = RegistryFileSchema.safeParse(JSON.parse(await readFile(REGISTRY_PATH, "utf-8")))
    if (parsed.success) for (const e of parsed.data) existing.set(e.lg_code, e)
    else console.warn("⚠ 既存の municipalities.json は旧形式のため引き継ぎません")
  }

  // slug を作り、同名衝突は都道府県を前置する(衝突しないものには付けない)
  const base = rows.map((r) => ({ row: r, slug: municipalitySlug(r.name_ja, r.kana) }))
  const count = new Map<string, number>()
  for (const b of base) count.set(b.slug, (count.get(b.slug) ?? 0) + 1)

  const entries: RegistryEntry[] = base.map(({ row, slug }) => {
    const prev = existing.get(row.lg_code)
    const generated =
      SLUG_OVERRIDES[row.lg_code] ??
      ((count.get(slug) ?? 0) > 1 ? `${prefectureSlugPart(row.pref, row.pref_kana)}-${slug}` : slug)
    return {
      // 一度公開した slug は変えない(URL互換)
      slug: prev?.slug ?? generated,
      lg_code: row.lg_code,
      pref: row.pref,
      name_ja: row.name_ja,
      name_en: municipalityNameEn(slug),
      status: prev?.status ?? "unsupported",
      official_url: prev?.official_url ?? null,
    }
  })

  const result = RegistryFileSchema.safeParse(entries)
  if (!result.success) {
    console.error("✗ validate: レジストリ検証エラー")
    console.error(result.error.issues.slice(0, 20))
    process.exit(1)
  }

  await writeFile(REGISTRY_PATH, JSON.stringify(entries, null, 2) + "\n", "utf-8")
  const prefixed = base.filter((b) => (count.get(b.slug) ?? 0) > 1).map((b) => entries.find((e) => e.lg_code === b.row.lg_code)!)
  console.log(`✓ emit: ${REGISTRY_PATH}`)
  console.log(`  件数: ${entries.length}(対応 ${entries.filter((e) => e.status === "supported").length})`)
  console.log(`  都道府県を前置した同名自治体: ${prefixed.length} 件(例: ${prefixed.slice(0, 6).map((e) => e.slug).join(", ")})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
