import { z } from "zod"

// 収集区分ID(data/categories.json と連動)
export const CategoryIdSchema = z.enum([
  "futsu",
  "shigen",
  "plastic",
  "koshi-irui",
  "sodai",
  "kogata-kaden",
  "kogata-kaden-takuhai",
  "pc-recycle",
  "kyoten",
  "shudan-kaishu",
  "li-ion",
  "not-collected",
])
export type CategoryId = z.infer<typeof CategoryIdSchema>

export const CategorySchema = z.object({
  id: CategoryIdSchema,
  name_ja: z.string().min(1),
  name_en: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  icon: z.string().min(1),
})
export type Category = z.infer<typeof CategorySchema>

export const MunicipalitySchema = z.object({
  id: z.string().min(1),
  name_ja: z.string().min(1),
  name_en: z.string().min(1),
  official_url: z.string().url(),
  source_url: z.string().url(),
  source_license: z.string().min(1),
  source_attribution: z.string().min(1),
  sodai_apply_url: z.string().url(),
  sodai_tel_landline: z.string().min(1),
  sodai_tel_mobile: z.string().min(1),
  data_fetched_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type Municipality = z.infer<typeof MunicipalitySchema>

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
  url: z.string().url().nullable(),
  effort: z.enum(["low", "medium", "high"]),
  money: z.enum(["free", "earn", "cost"]),
})
export type ReuseOption = z.infer<typeof ReuseOptionSchema>

export const ReuseCategorySchema = z.object({
  id: ReuseCategoryIdSchema,
  label_ja: z.string().min(1),
  label_en: z.string().min(1),
  options: z.array(ReuseOptionSchema).min(1),
})
export type ReuseCategory = z.infer<typeof ReuseCategorySchema>

export const DispositionSchema = z.object({
  category_id: CategoryIdSchema,
  // 注意文言。誤案内リスク回避のため原文をそのまま保持(空文字は null にする)
  note_ja: z.string().nullable(),
  official_link: z.string().url().nullable(),
})
export type Disposition = z.infer<typeof DispositionSchema>

export const ItemSchema = z.object({
  id: z.string().regex(/^osk-\d{4}$/),
  name_ja: z.string().min(1),
  name_kana: z.string().min(1),
  aliases: z.array(z.string()),
  dispositions: z.array(DispositionSchema).min(1),
  sodai_fee_yen: z.number().int().positive().nullable(),
  reuse_category: ReuseCategoryIdSchema.nullable(),
  name_en: z.string().nullable(),
})
export type Item = z.infer<typeof ItemSchema>

export const ItemsFileSchema = z.object({
  municipality_id: z.string().min(1),
  generated_at: z.string().min(1),
  source_url: z.string().url(),
  item_count: z.number().int().nonnegative(),
  items: z.array(ItemSchema),
})
export type ItemsFile = z.infer<typeof ItemsFileSchema>
