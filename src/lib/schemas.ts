import { z } from "zod"
import { CATEGORY_KINDS } from "./category-kind"

// ---- 共通ID ----

/** 自治体スラッグ・区分ID等に使う kebab-case 文字列 */
const KebabSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

/** 自治体スラッグ(URL の /[municipality] 部分) */
export const SlugSchema = KebabSchema
/** 品目ID。prefix は自治体ごと(municipality.json の item_id_prefix) */
export const ItemIdSchema = z.string().regex(/^[a-z0-9]{2,8}-\d{4}$/)

// ---- 収集区分(自治体ごと) ----

export const CategoryKindSchema = z.enum(CATEGORY_KINDS)

/** 区分IDは自治体ごとの自由文字列。存在確認は自治体の categories.json に対して行う */
export const CategoryIdSchema = KebabSchema
export type CategoryId = z.infer<typeof CategoryIdSchema>

export const CategorySchema = z.object({
  id: CategoryIdSchema,
  kind: CategoryKindSchema,
  name_ja: z.string().min(1),
  name_en: z.string().min(1),
  /** 省略時は kind の既定色 */
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  /** 省略時は kind の既定アイコン */
  icon: z.string().min(1).optional(),
})
export type Category = z.infer<typeof CategorySchema>

export const CategoriesFileSchema = z
  .array(CategorySchema)
  .min(1)
  .superRefine((cats, ctx) => {
    const seen = new Set<string>()
    for (const c of cats) {
      if (seen.has(c.id)) {
        ctx.addIssue({ code: "custom", message: `区分IDが重複: ${c.id}` })
      }
      seen.add(c.id)
    }
  })

// ---- 自治体 ----

/** URL の第1階層と衝突するため自治体スラッグに使えない語 */
export const RESERVED_SLUGS = [
  "about",
  "item",
  "items",
  "data",
  "api",
  "_next",
  "static",
  "public",
  "favicon.ico",
  "icon.svg",
  "ogp.png",
]

/** 全国レジストリの1件(data/municipalities.json) */
export const RegistryEntrySchema = z.object({
  slug: SlugSchema,
  /** 全国地方公共団体コード(6桁、検査数字込み) */
  lg_code: z.string().regex(/^\d{6}$/),
  pref: z.string().min(1),
  name_ja: z.string().min(1),
  name_en: z.string().min(1),
  status: z.enum(["supported", "unsupported"]),
  official_url: z.string().url().nullable(),
})
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>

export const RegistryFileSchema = z
  .array(RegistryEntrySchema)
  .superRefine((entries, ctx) => {
    const slugs = new Set<string>()
    const codes = new Set<string>()
    for (const e of entries) {
      if (slugs.has(e.slug)) {
        ctx.addIssue({ code: "custom", message: `slugが重複: ${e.slug}` })
      }
      if (codes.has(e.lg_code)) {
        ctx.addIssue({ code: "custom", message: `lg_codeが重複: ${e.lg_code}` })
      }
      if (RESERVED_SLUGS.includes(e.slug)) {
        ctx.addIssue({ code: "custom", message: `予約語のslug: ${e.slug}` })
      }
      if (e.status === "supported" && !e.official_url) {
        ctx.addIssue({
          code: "custom",
          message: `対応自治体に official_url が無い: ${e.slug}`,
        })
      }
      slugs.add(e.slug)
      codes.add(e.lg_code)
    }
  })

/** 対応自治体ごとのメタ情報(data/municipalities/<slug>/municipality.json) */
export const MunicipalityMetaSchema = z.object({
  slug: SlugSchema,
  item_id_prefix: z.string().regex(/^[a-z0-9]{2,8}$/),
  source_url: z.string().url(),
  source_type: z.enum(["opendata-csv", "html-table", "manual"]),
  source_license: z.string().min(1),
  source_attribution: z.string().min(1),
  source_attribution_en: z.string().min(1),
  /** 粗大ごみ制度・申込先が無い自治体もあるため任意 */
  sodai_apply_url: z.string().url().nullable(),
  sodai_tel_landline: z.string().min(1).nullable(),
  sodai_tel_mobile: z.string().min(1).nullable(),
  data_fetched_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** 配信JSONのキャッシュバスター */
  data_version: z.string().regex(/^[0-9A-Za-z-]+$/),
})
export type MunicipalityMeta = z.infer<typeof MunicipalityMetaSchema>

/** アプリで使う対応自治体の情報(レジストリ+メタを合成したもの) */
export type Municipality = MunicipalityMeta &
  Omit<RegistryEntry, "official_url" | "status"> & { official_url: string }

// ---- 手放し導線 ----

// reuse_category(data/reuse-options.json の id と連動)
export const ReuseCategoryIdSchema = z.enum([
  "clothing",
  "small-appliance",
  "furniture",
  "books-media",
  "toys-baby",
  "instruments",
  "returnable",
])
export type ReuseCategoryId = z.infer<typeof ReuseCategoryIdSchema>

export const ReuseOptionSchema = z.object({
  type: z.enum(["official", "resale", "donation", "give"]),
  title_ja: z.string().min(1),
  title_en: z.string().min(1),
  desc_ja: z.string().min(1),
  desc_en: z.string().min(1),
  url: z.string().url().nullable(),
  effort: z.enum(["low", "medium", "high"]),
  money: z.enum(["free", "earn", "cost"]),
  /** 指定があればその自治体でのみ表示(自治体の公式回収など)。無ければ全国共通 */
  municipality_id: SlugSchema.optional(),
})
export type ReuseOption = z.infer<typeof ReuseOptionSchema>

export const ReuseCategorySchema = z.object({
  id: ReuseCategoryIdSchema,
  label_ja: z.string().min(1),
  label_en: z.string().min(1),
  options: z.array(ReuseOptionSchema).min(1),
})
export type ReuseCategory = z.infer<typeof ReuseCategorySchema>

// ---- 品目 ----

export const DispositionSchema = z.object({
  category_id: CategoryIdSchema,
  // 注意文言。誤案内リスク回避のため原文をそのまま保持(空文字は null にする)
  note_ja: z.string().nullable(),
  official_link: z.string().url().nullable(),
})
export type Disposition = z.infer<typeof DispositionSchema>

export const ItemSchema = z.object({
  id: ItemIdSchema,
  name_ja: z.string().min(1),
  name_kana: z.string().min(1),
  /** 英語モードで name_en が無い品目のフォロー表示用(かな→ヘボン式) */
  name_romaji: z.string().min(1),
  aliases: z.array(z.string()),
  dispositions: z.array(DispositionSchema).min(1),
  sodai_fee_yen: z.number().int().positive().nullable(),
  reuse_category: ReuseCategoryIdSchema.nullable(),
  name_en: z.string().nullable(),
})
export type Item = z.infer<typeof ItemSchema>

/** クライアント配信用の軽量検索インデックス(1エントリ=1品目) */
export const SearchIndexItemSchema = z.object({
  id: ItemIdSchema,
  /** name_ja */
  n: z.string().min(1),
  /** name_kana */
  k: z.string().min(1),
  /** aliases */
  a: z.array(z.string()),
  /** name_en */
  e: z.string().nullable(),
  /** 区分ID(重複除去済み) */
  c: z.array(CategoryIdSchema).min(1),
  /** sodai_fee_yen */
  f: z.number().int().positive().nullable(),
  /** reuse_category(♻️インジケータ用) */
  r: ReuseCategoryIdSchema.nullable(),
})
export type SearchIndexItem = z.infer<typeof SearchIndexItemSchema>

export const SearchIndexFileSchema = z.array(SearchIndexItemSchema)

export const ItemsFileSchema = z.object({
  municipality_id: SlugSchema,
  generated_at: z.string().min(1),
  source_url: z.string().url(),
  item_count: z.number().int().nonnegative(),
  items: z.array(ItemSchema),
})
export type ItemsFile = z.infer<typeof ItemsFileSchema>

/** 詳細データのシャード(public/data/<slug>/items/NN.json): 品目ID → 品目 */
export const ItemShardSchema = z.record(ItemIdSchema, ItemSchema)
export type ItemShard = z.infer<typeof ItemShardSchema>

/** 品目名 → 品目ID の固定表(data/municipalities/<slug>/id-map.json)。追記専用 */
export const IdMapSchema = z.object({
  prefix: z.string().regex(/^[a-z0-9]{2,8}$/),
  next_seq: z.number().int().positive(),
  map: z.record(z.string().min(1), ItemIdSchema),
})
export type IdMap = z.infer<typeof IdMapSchema>
