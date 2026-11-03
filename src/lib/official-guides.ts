// 未対応の市区町村の「公式への導線」(data-model.md の導線の節)。品目データの無い市で、
// その市の分別をどこで調べればいいかを、市の公式の案内へのリンクで示す。中身は書き写さない。
// ファイルは4つ:
//   data/official-guides.json       市ごとの導線と担当課の電話(未対応の市だけ)
//   data/municipal-hosts.json       全市区町村の、市のサイトのホストと「公式サイトを見る」の行き先(top_url)
//   data/official-guide-hosts.json  市のページから案内されている外部のサイト(許可の一覧)
//   data/guide-reviews.json         見直しの予定日(切り替えの予定・電話の見直し)
// ファイルを読む処理は持たない(アプリは src/lib/data.ts、スクリプトは scripts/core/official-guides-file.ts)。
import { z } from "zod"
import { isRealDate, todayJst } from "./coverage"
import { HttpUrlSchema, SlugSchema, type RegistryEntry } from "./schemas"
import {
  EDITION_PRECISIONS,
  GUIDE_DOCUMENTS,
  GUIDE_KINDS,
  GUIDE_SCOPES,
  GUIDE_TARGETS,
  isOldEdition,
  type PublicGuides,
} from "./official-guides-display"

export * from "./official-guides-display"

/** 確かめた日(実在して、未来でない) */
const CheckedDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDate, { message: "実在しない日付です" })
  .refine((s) => s <= todayJst(), { message: "未来の日付です" })

/** 予定日(未来でもよい) */
const DueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDate, { message: "実在しない日付です" })

/** ホスト名(小文字、ポートなし) */
const HostSchema = z
  .string()
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, {
    message: "ホスト名の形ではありません(小文字・ポートなし)",
  })

/** URL のホスト名(小文字) */
export function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase()
}

const EditionSchema = z
  .object({
    value: z.string(),
    precision: z.enum(EDITION_PRECISIONS),
  })
  .superRefine((ed, ctx) => {
    const pattern =
      ed.precision === "day"
        ? /^\d{4}-\d{2}-\d{2}$/
        : ed.precision === "month"
          ? /^\d{4}-\d{2}$/
          : /^\d{4}$/
    if (!pattern.test(ed.value)) {
      ctx.addIssue({
        code: "custom",
        message: `版の値が細かさ(${ed.precision})と合いません: ${ed.value}`,
      })
      return
    }
    const asDate =
      ed.precision === "day"
        ? ed.value
        : ed.precision === "month"
          ? `${ed.value}-01`
          : `${ed.value}-01-01`
    if (!isRealDate(asDate))
      ctx.addIssue({ code: "custom", message: `実在しない版の日付です: ${ed.value}` })
    // 版が未来なのは、市が先に出している場合(年度版など)があるので、始まりの日だけを見る
    else if (asDate > todayJst())
      ctx.addIssue({ code: "custom", message: `版の始まりが未来です: ${ed.value}` })
  })

/** 外部のサイトのとき: 許可の一覧の ID と、そのサイトを案内している市のページ */
const ViaSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** 市のホストのページ。そこから url へのリンクがあることを確かめる(画面には出さない) */
  linked_from: HttpUrlSchema,
})

/** 導線1件の項目(組み合わせの検査は GuideLinkSchema。下書きの形を作る道具からも使う) */
export const GuideLinkBaseSchema = z.object({
    kind: z.enum(GUIDE_KINDS),
    url: HttpUrlSchema,
    target: z.enum(GUIDE_TARGETS),
    document: z.enum(GUIDE_DOCUMENTS),
    searchable: z.boolean(),
    /** 画面に出す名前(無ければ種類の名前)。日本語と英語は両方そろえる */
    label_ja: z.string().min(1).optional(),
    label_en: z.string().min(1).optional(),
    edition: EditionSchema.optional(),
    partial: z.boolean().default(false),
    scope: z.enum(GUIDE_SCOPES).default("whole"),
    /** ページの中の資料(PDF など)。見張りに使い、画面には出さない */
    document_url: HttpUrlSchema.optional(),
    /** ページから資料へのリンクの文言(見張りで、付け替えを見つける) */
    document_link_text: z.string().min(1).optional(),
    /** 資料(target が pdf なら url、そうでなければ document_url)の中身の sha256 */
    document_sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    /** 入れるときに人が見た、本文の停止の語の文脈(見張りでは新しい文脈だけを知らせる。画面には出さない) */
    known_stop_contexts: z.array(z.string().min(1)).optional(),
    /** 同じく、題名・見出しの停止の語の文脈(本文の文脈とは分けて比べる) */
    known_head_stop_contexts: z.array(z.string().min(1)).optional(),
    /** 確かめたときの最終の行き先(転送されるとき。外部のサイトは市を表すパスやクエリまで見る) */
    final_url: HttpUrlSchema.optional(),
    via: ViaSchema.optional(),
  })

export const GuideLinkSchema = GuideLinkBaseSchema.superRefine((l, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message })
    if (Boolean(l.label_ja) !== Boolean(l.label_en))
      issue("label_ja と label_en は両方そろえる")
    // 種類と資料の形の組み合わせ
    if (l.kind === "search" && l.document !== "search")
      issue("search の導線は document を search にする")
    if (l.kind === "app" && l.document !== "app")
      issue("app の導線は document を app にする")
    if (l.kind === "top" && l.document !== "html")
      issue("top の導線は document を html にする")
    if (l.kind === "list" && !["html", "text-pdf", "image-pdf"].includes(l.document))
      issue("list の導線は document を html・text-pdf・image-pdf のどれかにする")
    if (l.target === "pdf" && l.document !== "text-pdf" && l.document !== "image-pdf")
      issue("target が pdf なら document は text-pdf か image-pdf")
    if (l.target === "pdf" && l.document_url)
      issue("target が pdf のときは document_url を持たない(url が資料そのもの)")
    if (
      l.target === "html-page" &&
      (l.document === "text-pdf" || l.document === "image-pdf") &&
      !l.document_url
    )
      issue("ページから PDF を開く導線には document_url が要る")
    if (l.document_url && l.target !== "html-page")
      issue("document_url はページの導線だけ")
    if (l.searchable && l.document !== "html" && l.document !== "text-pdf")
      issue("searchable は html か text-pdf のときだけ true")
    if (l.document_link_text && !l.document_url)
      issue("document_link_text は document_url があるときだけ")
    // 見張りで資料の差し替えを見つけるため、PDF に直接つなぐ導線と中の資料にはハッシュが要る
    if ((l.target === "pdf" || l.document_url) && !l.document_sha256)
      issue("PDF に直接つなぐ導線と、中の資料のある導線には document_sha256 が要る")
    // 地区を選ぶ入口では、確かめた1本の版や文字の有無を入口全体のものとして出さない
    if (l.scope === "area-selector" && (l.edition || l.searchable))
      issue("area-selector の導線は edition を持たず、searchable を false にする")
    if (l.partial && l.kind !== "list") issue("partial は list の導線だけ")
  })
export type GuideLink = z.infer<typeof GuideLinkSchema>

/** 担当課の電話。市のページの本文で、担当課の名前と番号を確かめたものだけ(2026-11-04 Kaz 判断) */
const PhoneSchema = z.object({
  dept_ja: z.string().min(1),
  tel: z.string().regex(/^0\d{1,4}-\d{1,4}-\d{3,4}$/, {
    message: "電話番号の形ではありません(0から始まり、ハイフン区切り)",
  }),
  /** 内線など、番号に添える文 */
  note_ja: z.string().min(1).optional(),
  /** 名前と番号を確かめた市のページ(画面には出さない) */
  source_url: HttpUrlSchema,
  checked_at: CheckedDateSchema,
})

export const OfficialGuideEntrySchema = z
  .object({
    checked_at: CheckedDateSchema,
    links: z.array(GuideLinkSchema).default([]),
    phone: PhoneSchema.optional(),
    /** どの記録から作ったか(内部向け。画面には出さない) */
    source: z.string().min(1),
  })
  .superRefine((e, ctx) => {
    if (e.links.length === 0 && !e.phone)
      ctx.addIssue({ code: "custom", message: "導線か電話のどちらかが要る" })
    const kinds = e.links.map((l) => l.kind)
    for (const k of new Set(kinds)) {
      if (kinds.filter((x) => x === k).length > 1)
        ctx.addIssue({ code: "custom", message: `種類が重複しています: ${k}` })
    }
  })
export type OfficialGuideEntry = z.infer<typeof OfficialGuideEntrySchema>

export const OfficialGuidesFileSchema = z.record(SlugSchema, OfficialGuideEntrySchema)
export type OfficialGuidesFile = z.infer<typeof OfficialGuidesFileSchema>

export const MunicipalHostEntrySchema = z
  .object({
    /** 「公式サイトを見る」の行き先(確かめた市のトップ)。確かめられていなければ null */
    top_url: HttpUrlSchema.nullable(),
    /** その市のサイトのホスト。1つのホストは1つの市にしか属さない */
    hosts: z.array(HostSchema),
    checked_at: CheckedDateSchema.optional(),
    /** 何で確かめたか(内部向け) */
    basis: z.string().min(1),
  })
  .superRefine((e, ctx) => {
    if (e.top_url && !e.hosts.includes(hostOf(e.top_url)))
      ctx.addIssue({ code: "custom", message: "top_url のホストが hosts にありません" })
    if (e.top_url && !e.checked_at)
      ctx.addIssue({ code: "custom", message: "top_url には checked_at が要る" })
    if (new Set(e.hosts).size !== e.hosts.length)
      ctx.addIssue({ code: "custom", message: "hosts が重複しています" })
  })
export type MunicipalHostEntry = z.infer<typeof MunicipalHostEntrySchema>

export const MunicipalHostsFileSchema = z.record(SlugSchema, MunicipalHostEntrySchema)
export type MunicipalHostsFile = z.infer<typeof MunicipalHostsFileSchema>

export const GuideServiceSchema = z.object({
  name_ja: z.string().min(1),
  name_en: z.string().min(1),
  hosts: z.array(HostSchema).min(1),
  /** リンクについての規約を確かめたページ。見つからなければ null(note に書く) */
  terms_url: HttpUrlSchema.nullable(),
  checked_at: CheckedDateSchema,
  note: z.string().min(1).optional(),
})
export type GuideService = z.infer<typeof GuideServiceSchema>

export const GuideServicesFileSchema = z.record(
  z.string().regex(/^[a-z0-9-]+$/),
  GuideServiceSchema
)
export type GuideServicesFile = z.infer<typeof GuideServicesFileSchema>

export const GuideReviewSchema = z.object({
  slug: SlugSchema,
  due: DueDateSchema,
  reason_ja: z.string().min(1),
})
export type GuideReview = z.infer<typeof GuideReviewSchema>

export const GuideReviewsFileSchema = z.array(GuideReviewSchema)
export type GuideReviewsFile = z.infer<typeof GuideReviewsFileSchema>

export type GuideFiles = {
  guides: OfficialGuidesFile
  hosts: MunicipalHostsFile
  services: GuideServicesFile
  reviews: GuideReviewsFile
}

/**
 * 4つのファイルと全国レジストリの食い違い。戻り値が空なら問題なし。
 * - 市のホストの表は、レジストリの全市区町村を過不足なく持ち、1つのホストは1つの市にしか属さない
 * - 導線のある市は、レジストリで未対応の市の一部(市を対応済みにしたら、同じコミットで導線を消す)
 * - 導線の URL は、その市のホストか、許可の一覧の外部サイト(その導線の via.id のホスト)
 */
export function officialGuideProblems(
  files: GuideFiles,
  registry: readonly RegistryEntry[]
): string[] {
  const { guides, hosts, services, reviews } = files
  const problems: string[] = []
  const bySlug = new Map(registry.map((e) => [e.slug, e]))

  // 市のホストの表
  for (const slug of Object.keys(hosts)) {
    if (!bySlug.has(slug)) problems.push(`市のホストの表に、レジストリに無い slug: ${slug}`)
  }
  for (const e of registry) {
    if (!(e.slug in hosts)) problems.push(`市のホストの表に無い市区町村: ${e.slug}`)
  }
  const hostOwner = new Map<string, string>()
  for (const [slug, h] of Object.entries(hosts)) {
    for (const host of h.hosts) {
      const owner = hostOwner.get(host)
      if (owner) problems.push(`1つのホストが2つの市に属しています: ${host}(${owner} と ${slug})`)
      else hostOwner.set(host, slug)
    }
  }

  // 外部のサイトの許可の一覧
  const serviceOfHost = new Map<string, string>()
  for (const [id, s] of Object.entries(services)) {
    for (const host of s.hosts) {
      const owner = hostOwner.get(host)
      if (owner) problems.push(`外部のサイト ${id} のホストが市のホストの表にもあります: ${host}(${owner})`)
      const other = serviceOfHost.get(host)
      if (other) problems.push(`外部のサイトのホストが重複しています: ${host}(${other} と ${id})`)
      else serviceOfHost.set(host, id)
    }
  }

  // 導線
  for (const [slug, g] of Object.entries(guides)) {
    const entry = bySlug.get(slug)
    if (!entry) {
      problems.push(`導線に、レジストリに無い slug: ${slug}`)
      continue
    }
    if (entry.status === "supported") {
      problems.push(`対応済みの自治体に導線が残っている(導線を消す): ${slug}`)
      continue
    }
    const own = new Set(hosts[slug]?.hosts ?? [])
    const isOwn = (url: string) => own.has(hostOf(url))
    for (const l of g.links) {
      const where = `${slug} の ${l.kind}`
      if (isOwn(l.url)) {
        if (l.via) problems.push(`${where}: 市のホストの導線に via は要りません`)
      } else {
        const owner = hostOwner.get(hostOf(l.url))
        if (owner) {
          problems.push(`${where}: 別の市(${owner})のホストです: ${l.url}`)
          continue
        }
        if (!l.via) {
          problems.push(`${where}: 市のホストでない導線には via が要ります: ${l.url}`)
          continue
        }
        const service = services[l.via.id]
        if (!service) {
          problems.push(`${where}: 許可の一覧に無い外部のサイトです: ${l.via.id}`)
          continue
        }
        if (!service.hosts.includes(hostOf(l.url)))
          problems.push(`${where}: url のホストが ${l.via.id} のホストと違います: ${l.url}`)
        if (!isOwn(l.via.linked_from))
          problems.push(`${where}: linked_from はその市のホストのページにする: ${l.via.linked_from}`)
      }
      // 確かめたときの最終の行き先・中の資料も、同じ市か同じ外部のサイトのもの
      const allowed = (url: string) =>
        isOwn(url) ||
        (l.via !== undefined && (services[l.via.id]?.hosts ?? []).includes(hostOf(url)))
      if (l.final_url && !allowed(l.final_url))
        problems.push(`${where}: final_url のホストがその市・その外部のサイトのものでない: ${l.final_url}`)
      if (l.document_url && !allowed(l.document_url))
        problems.push(`${where}: document_url のホストがその市・その外部のサイトのものでない: ${l.document_url}`)
    }
    if (g.phone && !isOwn(g.phone.source_url))
      problems.push(`${slug} の電話: 確かめたページが市のホストでない: ${g.phone.source_url}`)
  }

  // 予定日
  for (const r of reviews) {
    if (!bySlug.has(r.slug)) problems.push(`予定の表に、レジストリに無い slug: ${r.slug}`)
  }
  return problems
}

/** 食い違いがあれば止める(読み込み・ビルド前の準備・道具・テストで共通に使う) */
export function assertOfficialGuides(
  files: GuideFiles,
  registry: readonly RegistryEntry[]
): void {
  const problems = officialGuideProblems(files, registry)
  if (problems.length > 0) {
    const head = problems.slice(0, 20).join("\n  ")
    const more = problems.length > 20 ? `\n  …ほか ${problems.length - 20} 件` : ""
    throw new Error(`公式への導線のデータが食い違っています:\n  ${head}${more}`)
  }
}

/**
 * 画面に渡す形。項目を選んで作る(中の資料の URL・紹介元・目印・電話を確かめたページ・作った記録は渡さない。
 * 渡すと、表示しなくてもページの中身に入るため)
 */
export function toPublicGuides(
  entry: OfficialGuideEntry,
  services: GuideServicesFile,
  today: string = todayJst()
): PublicGuides {
  const order = new Map(GUIDE_KINDS.map((k, i) => [k, i]))
  const links = [...entry.links]
    .sort((a, b) => (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0))
    .map((l) => {
      const service = l.via ? services[l.via.id] : undefined
      return {
        kind: l.kind,
        url: l.url,
        target: l.target,
        document: l.document,
        searchable: l.searchable,
        label_ja: l.label_ja ?? null,
        label_en: l.label_en ?? null,
        edition: l.edition ? { value: l.edition.value, precision: l.edition.precision } : null,
        edition_old: l.edition ? isOldEdition(l.edition, today) : false,
        partial: l.partial,
        scope: l.scope,
        via_name_ja: service?.name_ja ?? null,
        via_name_en: service?.name_en ?? null,
      }
    })
  return {
    checked_at: entry.checked_at,
    links,
    phone: entry.phone
      ? {
          dept_ja: entry.phone.dept_ja,
          tel: entry.phone.tel,
          note_ja: entry.phone.note_ja ?? null,
          checked_at: entry.phone.checked_at,
        }
      : null,
  }
}
