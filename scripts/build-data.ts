/**
 * データパイプライン: fetch → parse → enrich → validate → emit
 * 大阪市「品目別収集区分一覧表」(CC-BY 4.0)から data/items/osaka-city.json を生成する。
 *
 * 実行: npm run build-data [-- --refresh]
 *   --refresh: キャッシュを無視して市サイトから再取得(通常は不要)
 */
import { existsSync } from "node:fs"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import kuromoji from "kuromoji"
import { toRomaji } from "wanakana"

import {
  ItemsFileSchema,
  SearchIndexFileSchema,
  type CategoryId,
  type Item,
  type ItemsFile,
  type ReuseCategoryId,
  type SearchIndexItem,
  ReuseCategoryIdSchema,
} from "../src/lib/schemas"
import { fetchWithCache } from "./lib/fetch-cache"
import { parseItemTables } from "./lib/parse"
import { normalizeLabel, resolveCategoryId } from "./lib/category-map"
import {
  extractSodaiFee,
  inferReuseCategory,
  katakanaToHiragana,
} from "./lib/enrich"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const SOURCE_URL = "https://www.city.osaka.lg.jp/kankyo/page/0000201907.html"
const CACHE_PATH = join(ROOT, "data/cache/osaka-items.html")
const OUT_PATH = join(ROOT, "data/items/osaka-city.json")
const SEARCH_OUT_PATH = join(ROOT, "data/items/osaka-city.search.json")
const ALIASES_PATH = join(ROOT, "data/aliases.json")
const OVERRIDES_PATH = join(ROOT, "data/reuse-overrides.json")
const ITEMS_EN_PATH = join(ROOT, "data/i18n/items.en.json")

async function readJsonIfExists<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null
  return JSON.parse(await readFile(path, "utf-8")) as T
}

/** kuromoji トークナイザ(ビルド時のみ使用) */
function buildTokenizer(): Promise<
  kuromoji.Tokenizer<kuromoji.IpadicFeatures>
> {
  return new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: join(ROOT, "node_modules/kuromoji/dict") })
      .build((err, tokenizer) => (err ? reject(err) : resolve(tokenizer)))
  })
}

/** 品目名 → 検索用ひらがな読み。読みが取れない語は表層のカタカナをひらがな化 */
function toKana(
  tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures>,
  name: string
): string {
  const reading = tokenizer
    .tokenize(name)
    .map((t) => (t.reading && t.reading !== "*" ? t.reading : t.surface_form))
    .join("")
  const kana = katakanaToHiragana(reading)
  // 読み生成に完全に失敗した場合のフォールバック
  return kana || katakanaToHiragana(name)
}

async function main() {
  const refresh = process.argv.includes("--refresh")

  // ---- fetch ----
  const { html, fromCache } = await fetchWithCache(
    SOURCE_URL,
    CACHE_PATH,
    refresh
  )
  console.log(
    fromCache
      ? `✓ fetch: キャッシュ使用 (${CACHE_PATH})`
      : `✓ fetch: 市サイトから取得しキャッシュ保存 (${CACHE_PATH})`
  )

  // ---- parse ----
  const rawItems = parseItemTables(html, SOURCE_URL)
  console.log(`✓ parse: ${rawItems.length} 品目(行集約後)`)

  // ---- enrich ----
  const tokenizer = await buildTokenizer()
  const aliasesDict =
    (await readJsonIfExists<Record<string, string[]>>(ALIASES_PATH)) ?? {}
  const overrides =
    (await readJsonIfExists<Record<string, string | null>>(OVERRIDES_PATH)) ??
    {}
  const itemsEn =
    (await readJsonIfExists<Record<string, string>>(ITEMS_EN_PATH)) ?? {}

  const unresolvedLabels = new Map<string, string[]>() // label -> 品目名リスト
  const items: Item[] = []
  let seq = 0

  for (const raw of rawItems) {
    const dispositions = []
    for (const row of raw.rows) {
      const categoryId = resolveCategoryId(row.category_label)
      if (!categoryId) {
        const key = normalizeLabel(row.category_label)
        const list = unresolvedLabels.get(key) ?? []
        list.push(raw.name_ja)
        unresolvedLabels.set(key, list)
        continue
      }
      dispositions.push({
        category_id: categoryId,
        note_ja: row.note,
        official_link: row.official_link,
      })
    }
    if (dispositions.length === 0) continue // 全区分が未解決だった品目は保留

    seq += 1
    const categoryIds = dispositions.map((d) => d.category_id) as CategoryId[]
    const notes = dispositions.map((d) => d.note_ja)

    // reuse_category: overrides > ヒューリスティック
    let reuse: ReuseCategoryId | null
    if (raw.name_ja in overrides) {
      const o = overrides[raw.name_ja]
      reuse = o === null ? null : ReuseCategoryIdSchema.parse(o)
    } else {
      reuse = inferReuseCategory(raw.name_ja, categoryIds, notes)
    }

    // 別名マージ: 完全一致に加え、2文字以上のキーは品目名への部分一致でも付与
    // (例: 「ペットボトル」の別名 PET を「ジュースのペットボトル」にも)
    const aliasSet = new Set<string>(aliasesDict[raw.name_ja] ?? [])
    for (const [key, vals] of Object.entries(aliasesDict)) {
      if (key.length >= 2 && key !== raw.name_ja && raw.name_ja.includes(key)) {
        for (const v of vals) aliasSet.add(v)
      }
    }

    const nameKana = toKana(tokenizer, raw.name_ja)

    items.push({
      id: `osk-${String(seq).padStart(4, "0")}`,
      name_ja: raw.name_ja,
      name_kana: nameKana,
      // 英語モードのフォロー表示用(かな→ローマ字。かなに残った漢字はそのまま)
      name_romaji: toRomaji(nameKana),
      aliases: [...aliasSet],
      dispositions,
      sodai_fee_yen: notes.reduce<number | null>(
        (acc, n) => acc ?? extractSodaiFee(n),
        null
      ),
      reuse_category: reuse,
      name_en: itemsEn[raw.name_ja] ?? null,
    })
  }

  const out: ItemsFile = {
    municipality_id: "osaka-city",
    generated_at: new Date().toISOString(),
    source_url: SOURCE_URL,
    item_count: items.length,
    items,
  }

  // ---- validate ----
  const parsed = ItemsFileSchema.safeParse(out)
  if (!parsed.success) {
    console.error("✗ validate: zodスキーマ検証エラー")
    console.error(parsed.error.issues.slice(0, 20))
    process.exit(1)
  }
  console.log("✓ validate: zodスキーマ検証パス")

  if (items.length < 1000) {
    console.warn(
      `⚠ 品目数が目安(1,000)を下回っています: ${items.length} 件。パーサ破損の可能性を確認してください`
    )
  }
  // 「収集しません」区分で note が無いのは注意文言欠落の疑い
  const notCollectedWithoutNote = items.filter((i) =>
    i.dispositions.some(
      (d) => d.category_id === "not-collected" && !d.note_ja
    )
  )
  if (notCollectedWithoutNote.length > 0) {
    console.warn(
      `⚠ 「収集しません」なのに注意文言が無い品目: ${notCollectedWithoutNote
        .slice(0, 10)
        .map((i) => i.name_ja)
        .join(", ")} 他`
    )
  }

  // ---- emit ----
  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf-8")
  console.log(`✓ emit: ${OUT_PATH}`)

  // クライアント配信用の軽量検索インデックス(改行なし=サイズ優先)
  const searchIndex: SearchIndexItem[] = items.map((i) => ({
    id: i.id,
    n: i.name_ja,
    k: i.name_kana,
    a: i.aliases,
    e: i.name_en,
    c: [...new Set(i.dispositions.map((d) => d.category_id))],
    f: i.sodai_fee_yen,
    r: i.reuse_category,
  }))
  SearchIndexFileSchema.parse(searchIndex)
  await writeFile(
    SEARCH_OUT_PATH,
    JSON.stringify(searchIndex) + "\n",
    "utf-8"
  )
  console.log(`✓ emit: ${SEARCH_OUT_PATH}`)

  // ---- 統計サマリ ----
  console.log("\n===== 統計サマリ =====")
  console.log(`品目数: ${items.length}`)

  const byCategory = new Map<string, number>()
  for (const item of items) {
    for (const d of item.dispositions) {
      byCategory.set(d.category_id, (byCategory.get(d.category_id) ?? 0) + 1)
    }
  }
  console.log("区分別件数(延べ):")
  for (const [cat, count] of [...byCategory.entries()].sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${cat.padEnd(22)} ${count}`)
  }

  const withReuse = items.filter((i) => i.reuse_category !== null)
  console.log(
    `reuse付与率: ${withReuse.length}/${items.length} (${(
      (withReuse.length / items.length) *
      100
    ).toFixed(1)}%)`
  )
  const sodaiItems = items.filter((i) =>
    i.dispositions.some((d) => d.category_id === "sodai")
  )
  const sodaiWithReuse = sodaiItems.filter((i) => i.reuse_category !== null)
  console.log(
    `粗大ごみ品目のreuse付与率: ${sodaiWithReuse.length}/${sodaiItems.length} (${(
      (sodaiWithReuse.length / Math.max(sodaiItems.length, 1)) *
      100
    ).toFixed(1)}%)`
  )
  console.log(`alias付与品目数: ${items.filter((i) => i.aliases.length > 0).length}`)
  console.log(
    `sodai_fee抽出数: ${items.filter((i) => i.sodai_fee_yen !== null).length}`
  )

  if (unresolvedLabels.size > 0) {
    console.warn(`\n⚠ 未解決の区分ラベル: ${unresolvedLabels.size} 種`)
    for (const [label, names] of unresolvedLabels) {
      console.warn(
        `  「${label}」 (${names.length}件: ${names.slice(0, 5).join(", ")}${
          names.length > 5 ? " ..." : ""
        })`
      )
    }
    process.exitCode = 2 // 完了条件違反として異常終了コード
  } else {
    console.log("未解決の区分ラベル: 0 ✓")
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
