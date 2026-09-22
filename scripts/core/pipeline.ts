/**
 * 共通パイプライン: fetch → parse → enrich → validate → emit(tech-stack.md §11)。
 * 自治体固有の処理はアダプタ(scripts/adapters/<slug>/)に閉じ込め、ここは自治体を知らない。
 * 区分の意味は区分IDではなく kind で判定する。
 */
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import kuromoji from "kuromoji"
import { toRomaji } from "wanakana"

import type { CategoryKind } from "../../src/lib/category-kind"
import {
  CategoriesFileSchema,
  IdMapSchema,
  ItemsFileSchema,
  MunicipalityMetaSchema,
  ReuseCategoryIdSchema,
  type Disposition,
  type IdMap,
  type Item,
  type ItemsFile,
  type ReuseCategoryId,
} from "../../src/lib/schemas"
import {
  extractSodaiFee,
  inferReuseCategory,
  katakanaToHiragana,
} from "./enrich"
import { assignIds, emptyIdMap } from "./ids"
import {
  COMMON_ALIASES_PATH,
  COMMON_ITEMS_EN_PATH,
  ROOT,
  municipalityFile,
} from "./paths"
import type { MunicipalityAdapter } from "./types"

async function readJsonIfExists<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null
  return JSON.parse(await readFile(path, "utf-8")) as T
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf-8")
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

/** 共通辞書と自治体辞書をマージ(自治体側が優先) */
async function loadMergedDict<T>(
  commonPath: string,
  localPath: string
): Promise<Record<string, T>> {
  const common = (await readJsonIfExists<Record<string, T>>(commonPath)) ?? {}
  const local = (await readJsonIfExists<Record<string, T>>(localPath)) ?? {}
  return { ...common, ...local }
}

export interface PipelineResult {
  ok: boolean
  itemCount: number
}

export async function runPipeline(
  adapter: MunicipalityAdapter,
  opts: { refresh: boolean }
): Promise<PipelineResult> {
  const slug = adapter.slug
  console.log(`\n===== ${slug} =====`)

  // ---- 自治体の設定 ----
  const meta = MunicipalityMetaSchema.parse(
    JSON.parse(
      await readFile(municipalityFile(slug, "municipality.json"), "utf-8")
    )
  )
  const categories = CategoriesFileSchema.parse(
    JSON.parse(
      await readFile(municipalityFile(slug, "categories.json"), "utf-8")
    )
  )
  const kindById = new Map<string, CategoryKind>(
    categories.map((c) => [c.id, c.kind])
  )

  // ---- fetch ----
  const { source, fromCache, location } = await adapter.fetchSource(opts)
  console.log(
    fromCache
      ? `✓ fetch: キャッシュ使用 (${location})`
      : `✓ fetch: 取得しキャッシュ保存 (${location})`
  )

  // ---- parse ----
  const rawItems = adapter.parse(source)
  console.log(`✓ parse: ${rawItems.length} 品目(行集約後)`)

  // ---- enrich ----
  const tokenizer = await buildTokenizer()
  const aliasesDict = await loadMergedDict<string[]>(
    COMMON_ALIASES_PATH,
    municipalityFile(slug, "aliases.json")
  )
  const itemsEn = await loadMergedDict<string>(
    COMMON_ITEMS_EN_PATH,
    municipalityFile(slug, "items.en.json")
  )
  const overrides =
    (await readJsonIfExists<Record<string, string | null>>(
      municipalityFile(slug, "reuse-overrides.json")
    )) ?? {}

  const unresolvedLabels = new Map<string, string[]>() // label -> 品目名リスト
  const unknownCategoryIds = new Set<string>()
  type Pending = Omit<Item, "id">
  const pending: Pending[] = []

  for (const raw of rawItems) {
    const dispositions: Disposition[] = []
    for (const row of raw.rows) {
      const categoryId = adapter.resolveCategoryId(row.category_label)
      if (!categoryId) {
        const list = unresolvedLabels.get(row.category_label) ?? []
        list.push(raw.name_ja)
        unresolvedLabels.set(row.category_label, list)
        continue
      }
      if (!kindById.has(categoryId)) unknownCategoryIds.add(categoryId)
      dispositions.push({
        category_id: categoryId,
        note_ja: row.note,
        official_link: row.official_link,
      })
    }
    if (dispositions.length === 0) continue // 全区分が未解決だった品目は保留

    const kinds = dispositions
      .map((d) => kindById.get(d.category_id))
      .filter((k): k is CategoryKind => k !== undefined)
    const notes = dispositions.map((d) => d.note_ja)

    // reuse_category: overrides > ヒューリスティック
    let reuse: ReuseCategoryId | null
    if (raw.name_ja in overrides) {
      const o = overrides[raw.name_ja]
      reuse = o === null ? null : ReuseCategoryIdSchema.parse(o)
    } else {
      reuse = inferReuseCategory(raw.name_ja, kinds, notes)
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
    pending.push({
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

  // ---- 品目ID(id-map で固定) ----
  const idMapPath = municipalityFile(slug, "id-map.json")
  const prevIdMap: IdMap =
    (await readJsonIfExists<unknown>(idMapPath)) !== null
      ? IdMapSchema.parse(await readJsonIfExists<unknown>(idMapPath))
      : emptyIdMap(meta.item_id_prefix)
  if (prevIdMap.prefix !== meta.item_id_prefix) {
    throw new Error(
      `id-map の prefix(${prevIdMap.prefix})と municipality.json の item_id_prefix(${meta.item_id_prefix})が不一致`
    )
  }
  const { ids, idMap, added } = assignIds(
    pending.map((p) => p.name_ja),
    prevIdMap
  )
  const items: Item[] = pending.map((p, i) => ({ id: ids[i], ...p }))

  const out: ItemsFile = {
    municipality_id: slug,
    generated_at: new Date().toISOString(),
    source_url: meta.source_url,
    item_count: items.length,
    items,
  }

  // ---- validate ----
  let ok = true
  const parsed = ItemsFileSchema.safeParse(out)
  if (!parsed.success) {
    console.error("✗ validate: zodスキーマ検証エラー")
    console.error(parsed.error.issues.slice(0, 20))
    return { ok: false, itemCount: items.length }
  }
  console.log("✓ validate: zodスキーマ検証パス")

  if (unknownCategoryIds.size > 0) {
    console.error(
      `✗ categories.json に無い区分ID: ${[...unknownCategoryIds].join(", ")}(category-map と categories.json を揃えてください)`
    )
    return { ok: false, itemCount: items.length }
  }

  if (items.length < adapter.expectedMinItems) {
    console.warn(
      `⚠ 品目数が目安(${adapter.expectedMinItems})を下回っています: ${items.length} 件。パーサ破損の可能性を確認してください`
    )
  }
  const prevItems = await readJsonIfExists<ItemsFile>(
    municipalityFile(slug, "items.json")
  )
  if (prevItems && prevItems.item_count > 0) {
    const ratio =
      Math.abs(items.length - prevItems.item_count) / prevItems.item_count
    if (ratio > 0.1) {
      console.warn(
        `⚠ 品目数が前回から10%超変動: ${prevItems.item_count} → ${items.length}。パーサ破損の可能性を確認してください`
      )
    }
  }

  // 「収集しません」系の区分で注意文言が無いのは欠落の疑い(誤案内リスク最大)
  const notCollectedWithoutNote = items.filter((i) =>
    i.dispositions.some(
      (d) => kindById.get(d.category_id) === "not-collected" && !d.note_ja
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
  await writeJson(municipalityFile(slug, "items.json"), out)
  console.log(`✓ emit: ${municipalityFile(slug, "items.json")}`)
  if (JSON.stringify(idMap) !== JSON.stringify(prevIdMap)) {
    await writeJson(idMapPath, idMap)
    console.log(
      `✓ emit: ${idMapPath}(新規採番 ${added.length} 件: ${added.slice(0, 5).join(", ")}${added.length > 5 ? " ..." : ""})`
    )
  } else {
    console.log("✓ id-map: 変更なし(全品目が既存IDを再利用)")
  }

  // ---- 統計サマリ ----
  console.log("\n----- 統計サマリ -----")
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
    console.log(
      `  ${cat.padEnd(22)} ${String(count).padStart(4)}  (${kindById.get(cat)})`
    )
  }
  const pct = (n: number, d: number) =>
    `${n}/${d} (${((n / Math.max(d, 1)) * 100).toFixed(1)}%)`
  const withReuse = items.filter((i) => i.reuse_category !== null)
  console.log(`reuse付与率: ${pct(withReuse.length, items.length)}`)
  const bulkyItems = items.filter((i) =>
    i.dispositions.some((d) => kindById.get(d.category_id) === "bulky")
  )
  console.log(
    `粗大ごみ品目のreuse付与率: ${pct(bulkyItems.filter((i) => i.reuse_category !== null).length, bulkyItems.length)}`
  )
  console.log(
    `alias付与品目数: ${items.filter((i) => i.aliases.length > 0).length}`
  )
  console.log(
    `sodai_fee抽出数: ${items.filter((i) => i.sodai_fee_yen !== null).length}`
  )

  if (unresolvedLabels.size > 0) {
    console.warn(`\n⚠ 未解決の区分ラベル: ${unresolvedLabels.size} 種`)
    for (const [label, names] of unresolvedLabels) {
      console.warn(
        `  「${label}」 (${names.length}件: ${names.slice(0, 5).join(", ")}${names.length > 5 ? " ..." : ""})`
      )
    }
    ok = false // 完了条件違反
  } else {
    console.log("未解決の区分ラベル: 0 ✓")
  }
  return { ok, itemCount: items.length }
}
