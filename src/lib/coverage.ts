// 仕分けの台帳(data/coverage.json)。未対応の市区町村ごとに「なぜ未対応か」を持つ(data-model.md の台帳の節)。
// 対応済みかどうかは全国レジストリ(data/municipalities.json)の status が正で、台帳は未対応の市区町村だけを持つ。
// ファイルを読む処理は持たない(アプリは src/lib/data.ts、スクリプトは scripts/tools/coverage.ts から使う)。
import { z } from "zod"
import { HttpUrlSchema, SlugSchema, type RegistryEntry } from "./schemas"
import {
  COVERAGE_STATUSES,
  type CoverageStatus,
  type PublicCoverage,
} from "./coverage-display"

export { COVERAGE_STATUSES, type CoverageStatus, type PublicCoverage }


/** 実在する日付か(2026-02-30 などを拒否する) */
function isRealDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** 日本時間の今日(未来の日付の検査用) */
export function todayJst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDate, { message: "実在しない日付です" })
  .refine((s) => s <= todayJst(), { message: "未来の日付です" })

/** 判断に使った資料・探した場所。URL が無い資料(roadmap の記録など)は label だけでよい */
const SourceRefSchema = z.object({
  label: z.string().min(1),
  url: HttpUrlSchema.optional(),
})

export const CoverageEntrySchema = z
  .object({
    status: z.enum(COVERAGE_STATUSES),
    /** その分類を最後に確かめた日(日本時間)。記録に正確な日付が無ければ作らない */
    checked_at: DateSchema.optional(),
    /** その市だけの事情(画面に出す)。日本語と英語は両方そろえる */
    detail_ja: z.string().min(1).optional(),
    detail_en: z.string().min(1).optional(),
    /** 判断に使った資料(データ・規約・市の現行の案内)。画面には出さない */
    evidence: z.array(SourceRefSchema).default([]),
    /** no-data のとき、探した場所。画面には出さない */
    searched: z.array(SourceRefSchema).default([]),
    /** 内部向けのメモ。画面にもブラウザにも出さない */
    note: z.string().min(1).optional(),
  })
  .superRefine((e, ctx) => {
    if (Boolean(e.detail_ja) !== Boolean(e.detail_en)) {
      ctx.addIssue({
        code: "custom",
        message: "detail_ja と detail_en は両方そろえる",
      })
    }
    if (e.status === "unsurveyed") return
    if (!e.checked_at) {
      ctx.addIssue({ code: "custom", message: "調べた市には checked_at が要る" })
    }
    if (e.evidence.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "調べた市には根拠(evidence)が1件以上要る",
      })
    }
    if (e.status === "no-data" && e.searched.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "no-data には探した場所(searched)が1件以上要る",
      })
    }
  })
export type CoverageEntry = z.infer<typeof CoverageEntrySchema>

export const CoverageFileSchema = z.record(SlugSchema, CoverageEntrySchema)
export type CoverageFile = z.infer<typeof CoverageFileSchema>

/**
 * 台帳と全国レジストリの食い違い。台帳の slug の集まり = レジストリで未対応の slug の集まり(過不足ゼロ)。
 * 戻り値が空なら問題なし。自治体を追加したら、レジストリを supported にするのと同じコミットで台帳から消す
 */
export function coverageProblems(
  coverage: CoverageFile,
  registry: readonly RegistryEntry[]
): string[] {
  const problems: string[] = []
  const bySlug = new Map(registry.map((e) => [e.slug, e]))
  for (const slug of Object.keys(coverage)) {
    const entry = bySlug.get(slug)
    if (!entry) problems.push(`レジストリに無い slug が台帳にある: ${slug}`)
    else if (entry.status === "supported")
      problems.push(`対応済みの自治体が台帳に残っている(台帳から消す): ${slug}`)
  }
  for (const e of registry) {
    if (e.status !== "supported" && !(e.slug in coverage))
      problems.push(`未対応の自治体が台帳に無い: ${e.slug}`)
  }
  return problems
}

/** 食い違いがあれば止める(読み込み・ビルド前の準備・台帳の道具・テストで共通に使う) */
export function assertCoverageMatchesRegistry(
  coverage: CoverageFile,
  registry: readonly RegistryEntry[]
): void {
  const problems = coverageProblems(coverage, registry)
  if (problems.length > 0) {
    const head = problems.slice(0, 20).join("\n  ")
    const more = problems.length > 20 ? `\n  …ほか ${problems.length - 20} 件` : ""
    throw new Error(
      `仕分けの台帳(data/coverage.json)と全国レジストリが食い違っています:\n  ${head}${more}`
    )
  }
}

export function toPublicCoverage(entry: CoverageEntry): PublicCoverage {
  return {
    status: entry.status,
    checked_at: entry.checked_at ?? null,
    detail_ja: entry.detail_ja ?? null,
    detail_en: entry.detail_en ?? null,
  }
}

export type CoverageCounts = { supported: number; total: number } & Record<
  CoverageStatus,
  number
>

/**
 * 状態ごとの数。対応済みはレジストリから、未対応の内訳は台帳から別々に数え、
 * 合計がレジストリの件数と合わなければ止める。件数が相殺される食い違い(台帳の slug を
 * レジストリに無い slug に置き換えたなど)は合計では分からないので、先に食い違いの検査を通す
 */
export function countCoverage(
  coverage: CoverageFile,
  registry: readonly RegistryEntry[]
): CoverageCounts {
  assertCoverageMatchesRegistry(coverage, registry)
  const counts = Object.fromEntries(
    COVERAGE_STATUSES.map((s) => [s, 0])
  ) as Record<CoverageStatus, number>
  for (const e of Object.values(coverage)) counts[e.status] += 1
  const supported = registry.filter((e) => e.status === "supported").length
  const sum = supported + COVERAGE_STATUSES.reduce((n, s) => n + counts[s], 0)
  if (sum !== registry.length) {
    throw new Error(
      `状態ごとの数の合計(${sum})がレジストリの件数(${registry.length})と合いません`
    )
  }
  return { ...counts, supported, total: registry.length }
}
