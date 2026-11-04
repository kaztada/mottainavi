/**
 * 公式への導線の道具(data-model.md の導線の節)。
 *
 *   npm run guides -- hosts                      市のホストの表(data/municipal-hosts.json)を作り直す
 *   npm run guides -- check <下書き.json> [--report <出力.json>]   下書きの導線を確かめる(書かない)
 *   npm run guides -- apply <下書き.json>         確かめて、通った導線と電話だけを書く
 *   npm run guides -- remove <slug> [<種類>|phone]  その市の導線(種類を書けばその1件、phone なら電話)を外す。
 *                                                見張りで誤案内の疑いが見つかったときなど。予定の表のその市の行も直す
 *   npm run guides -- report                     いまの導線の一覧
 *
 * 取得は politeFetch の既定(キャッシュ優先。CLAUDE.md「再実行はキャッシュ優先」)。同じ URL は1回だけ。
 * 1市につき確かめる URL は4つまで(導線のページ・中の資料・外部サイトの紹介元・電話を確かめるページ)。
 *
 * 下書きの形: { "<slug>": { links: [導線(目印の項目なし)+ override?], phone?: {dept_ja, tel, note_ja?, source_url},
 *   source, reviews?: [{due, reason_ja}] } }。override は、人が見て受け入れた旗の理由(書き込みには残さない)
 */
import { readFileSync, writeFileSync } from "node:fs"
import { z } from "zod"
import { todayJst } from "../../src/lib/coverage"
import {
  GuideLinkBaseSchema,
  GuideLinkSchema,
  hostOf,
  type GuideFiles,
  type GuideLink,
  type OfficialGuideEntry,
} from "../../src/lib/official-guides"
import { HttpUrlSchema, SlugSchema, type RegistryEntry } from "../../src/lib/schemas"
import { readRegistry } from "../core/coverage-file"
import {
  GARBAGE_WORDS,
  OLD_WORDS,
  STOP_WORDS,
  comparableUrl,
  containsAny,
  findLinkTo,
  isHtml,
  isPdf,
  headText,
  readOutcomePage,
  phoneProblems,
  stopContexts,
  type FetchOutcome,
} from "../core/guide-check"
import {
  buildHosts,
  readGuideFiles,
  writeGuideFiles,
  type UrlCheckRecord,
} from "../core/official-guides-file"
import { CACHE_DIR } from "../core/paths"
import { politeFetch } from "../core/polite-fetch"
import { join } from "node:path"

const OFFICIAL_URL_CHECK_PATH = join(CACHE_DIR, "official-url-check.json")
/** 電話を載せた市の見直しの期日(4月の組織の改正の前。2026-11-04 Kaz 判断) */
export const PHONE_REVIEW_DUE = "2027-03-01"
const MAX_URLS_PER_CITY = 4

// ---- 下書きの確かめ ----

const DraftLinkSchema = GuideLinkBaseSchema.pick({
  kind: true,
  url: true,
  target: true,
  document: true,
  searchable: true,
  label_ja: true,
  label_en: true,
  edition: true,
  partial: true,
  scope: true,
  document_url: true,
  via: true,
}).extend({
  /** 人が見て受け入れた旗の理由(書き込みには残さない) */
  override: z.string().min(1).optional(),
})
type DraftLink = z.infer<typeof DraftLinkSchema>

const DraftEntrySchema = z.object({
  links: z.array(DraftLinkSchema).default([]),
  phone: z
    .object({
      dept_ja: z.string().min(1),
      tel: z.string(),
      note_ja: z.string().min(1).optional(),
      source_url: HttpUrlSchema,
    })
    .optional(),
  source: z.string().min(1),
  reviews: z.array(z.object({ due: z.string(), reason_ja: z.string().min(1) })).default([]),
})
type DraftEntry = z.infer<typeof DraftEntrySchema>
const DraftFileSchema = z.record(SlugSchema, DraftEntrySchema)

async function get(url: string): Promise<FetchOutcome> {
  try {
    const { record, body } = await politeFetch(url)
    return {
      status: record.status,
      final_url: record.final_url,
      content_type: record.content_type,
      error: record.error,
      body,
      sha256: record.sha256,
    }
  } catch (e) {
    return {
      status: 0,
      final_url: url,
      content_type: null,
      error: e instanceof Error ? e.message : String(e),
      body: null,
      sha256: null,
    }
  }
}

export type LinkCheck = {
  kind: string
  url: string
  ok: boolean
  /** 通らなかった理由・人が見る旗 */
  problems: string[]
  flags: string[]
  title: string | null
  final_url: string | null
  link?: GuideLink
}

export type CityCheck = {
  slug: string
  links: LinkCheck[]
  phone: { ok: boolean; problems: string[] } | null
}

/** 1市の下書きを確かめる(キャッシュ優先で取得) */
async function checkCity(
  slug: string,
  draft: DraftEntry,
  entry: RegistryEntry,
  files: GuideFiles
): Promise<CityCheck> {
  const cityHosts = files.hosts[slug]?.hosts ?? []
  const urls = new Set<string>()
  for (const l of draft.links) {
    urls.add(l.url)
    if (l.document_url) urls.add(l.document_url)
    if (l.via) urls.add(l.via.linked_from)
  }
  if (draft.phone) urls.add(draft.phone.source_url)
  if (urls.size > MAX_URLS_PER_CITY) {
    return {
      slug,
      links: draft.links.map((l) => ({
        kind: l.kind,
        url: l.url,
        ok: false,
        problems: [`1市で確かめる URL が ${MAX_URLS_PER_CITY} を超えます(${urls.size})`],
        flags: [],
        title: null,
        final_url: null,
      })),
      phone: draft.phone ? { ok: false, problems: ["URL の数の上限"] } : null,
    }
  }

  const links: LinkCheck[] = []
  for (const l of draft.links) links.push(await checkLink(l, entry, cityHosts, files))

  let phone: CityCheck["phone"] = null
  if (draft.phone) {
    const problems: string[] = []
    if (!cityHosts.includes(hostOf(draft.phone.source_url)))
      problems.push("確かめるページが市のホストでない")
    const o = await get(draft.phone.source_url)
    const page = o.status === 200 ? readOutcomePage(o) : null
    if (!page) problems.push(`ページを読めない(状態コード ${o.status}${o.error ? `、${o.error}` : ""})`)
    else if (!cityHosts.includes(hostOf(o.final_url)))
      problems.push(`確かめるページの行き先が市のホストでない: ${o.final_url}`)
    else problems.push(...phoneProblems(page.text, draft.phone.tel, draft.phone.dept_ja))
    phone = { ok: problems.length === 0, problems }
  }
  return { slug, links, phone }
}

async function checkLink(
  l: DraftLink,
  entry: RegistryEntry,
  cityHosts: string[],
  files: GuideFiles
): Promise<LinkCheck> {
  const problems: string[] = []
  const flags: string[] = []
  const service = l.via ? files.services[l.via.id] : undefined
  const allowed = [...cityHosts, ...(service?.hosts ?? [])]
  const base = { kind: l.kind, url: l.url }

  const o = await get(l.url)
  const finalHost = (() => {
    try {
      return hostOf(o.final_url)
    } catch {
      return ""
    }
  })()
  if (o.error || o.status !== 200 || !o.body) {
    return {
      ...base,
      ok: false,
      problems: [`取得できない(状態コード ${o.status}${o.error ? `、${o.error}` : ""})`],
      flags,
      title: null,
      final_url: o.final_url,
    }
  }
  if (!allowed.includes(finalHost)) problems.push(`行き先が市・許可のサイトのホストでない: ${o.final_url}`)
  if (l.via && !service) problems.push(`許可の一覧に無い外部のサイト: ${l.via.id}`)

  let title: string | null = null
  let stopCtx: string[] | undefined
  let headStopCtx: string[] | undefined
  let documentLinkText: string | undefined
  let documentSha: string | undefined
  if (l.target === "pdf") {
    if (!isPdf(o)) problems.push(`PDF ではない(${o.content_type})`)
    documentSha = o.sha256 ?? undefined
  } else {
    const page = readOutcomePage(o)
    if (!page || !isHtml(o)) problems.push(`HTML ではない(${o.content_type})`)
    else {
      title = page.title
      const head = `${page.title} ${page.headings}`
      if (!page.text.includes(entry.name_ja) && !page.title.includes(entry.name_ja))
        flags.push(`市の名前(${entry.name_ja})が題名・本文に無い`)
      if (containsAny(`${head} ${page.text}`, GARBAGE_WORDS).length === 0)
        flags.push("ごみの語が無い")
      const stop = containsAny(head, STOP_WORDS)
      if (stop.length > 0) flags.push(`題名・見出しに停止の語: ${stop.join("・")}`)
      stopCtx = stopContexts(page.text)
      headStopCtx = stopContexts(headText(page))
      if (stopCtx.length > 0) flags.push(`本文に停止の語(人が見る): ${stopCtx.slice(0, 3).join(" / ")}`)
      const old = containsAny(page.text, OLD_WORDS)
      if (old.length > 0) flags.push(`本文に古さの告知: ${old.join("・")}`)
      if (l.document_url) {
        const hit = findLinkTo(page, l.document_url)
        if (!hit) problems.push(`ページから資料へのリンクが無い: ${l.document_url}`)
        else documentLinkText = hit.text || undefined
      }
    }
  }
  if (l.document_url) {
    const d = await get(l.document_url)
    if (d.error || d.status !== 200 || !d.body) problems.push(`資料を取得できない(状態コード ${d.status})`)
    else {
      if (!allowed.includes(hostOf(d.final_url))) problems.push(`資料の行き先が別のホスト: ${d.final_url}`)
      if ((l.document === "text-pdf" || l.document === "image-pdf") && !isPdf(d))
        problems.push(`資料が PDF ではない(${d.content_type})`)
      documentSha = d.sha256 ?? undefined
    }
  }
  if (l.via) {
    const f = await get(l.via.linked_from)
    const page = f.status === 200 ? readOutcomePage(f) : null
    if (!page) problems.push(`紹介元のページを読めない(状態コード ${f.status})`)
    else {
      if (!cityHosts.includes(hostOf(f.final_url)))
        problems.push(`紹介元の行き先が市のホストでない: ${f.final_url}`)
      if (!findLinkTo(page, l.url) && !findLinkTo(page, o.final_url))
        problems.push(`紹介元から外部のサイトへのリンクが無い: ${l.url}`)
    }
  }
  if (flags.length > 0 && !l.override) problems.push(...flags.map((f) => `旗: ${f}`))

  const link: GuideLink = {
    kind: l.kind,
    url: l.url,
    target: l.target,
    document: l.document,
    searchable: l.searchable,
    label_ja: l.label_ja,
    label_en: l.label_en,
    edition: l.edition,
    partial: l.partial,
    scope: l.scope,
    document_url: l.document_url,
    document_link_text: documentLinkText,
    document_sha256: documentSha,
    known_stop_contexts: stopCtx && stopCtx.length > 0 ? stopCtx : undefined,
    known_head_stop_contexts: headStopCtx && headStopCtx.length > 0 ? headStopCtx : undefined,
    final_url:
      comparableUrl(o.final_url) !== comparableUrl(l.url) || l.via ? o.final_url : undefined,
    via: l.via,
  }
  const parsed = GuideLinkSchema.safeParse(link)
  if (!parsed.success) problems.push(...parsed.error.issues.map((i) => `形: ${i.message}`))
  return {
    ...base,
    ok: problems.length === 0,
    problems,
    flags,
    title,
    final_url: o.final_url,
    link: parsed.success ? parsed.data : undefined,
  }
}

/** 下書きの全市を確かめる(市ごとに並べて動かす。ホストごとの間隔は politeFetch が守る) */
async function checkDraft(path: string, files: GuideFiles, registry: RegistryEntry[]) {
  const draft = DraftFileSchema.parse(JSON.parse(readFileSync(path, "utf-8")))
  const bySlug = new Map(registry.map((e) => [e.slug, e]))
  const slugs = Object.keys(draft)
  const results: CityCheck[] = []
  let next = 0
  const worker = async () => {
    while (next < slugs.length) {
      const slug = slugs[next++]
      const entry = bySlug.get(slug)
      if (!entry || entry.status === "supported") {
        results.push({
          slug,
          links: [{ kind: "-", url: "-", ok: false, problems: ["未対応の市ではない"], flags: [], title: null, final_url: null }],
          phone: null,
        })
        continue
      }
      results.push(await checkCity(slug, draft[slug], entry, files))
      process.stderr.write(".")
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  process.stderr.write("\n")
  const order = new Map(registry.map((e, i) => [e.slug, i]))
  results.sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0))
  return { draft, results }
}

function printResults(results: CityCheck[]) {
  let okLinks = 0
  let ngLinks = 0
  for (const r of results) {
    for (const l of r.links) {
      if (l.ok) okLinks++
      else ngLinks++
      const mark = l.ok ? "○" : "×"
      console.log(`${mark} ${r.slug} ${l.kind} ${l.url}${l.title ? ` 「${l.title.slice(0, 40)}」` : ""}`)
      for (const p of l.problems) console.log(`    ${p}`)
      if (l.ok) for (const f of l.flags) console.log(`    (受け入れた旗) ${f}`)
    }
    if (r.phone) {
      console.log(`${r.phone.ok ? "○" : "×"} ${r.slug} 電話`)
      for (const p of r.phone.problems) console.log(`    ${p}`)
    }
  }
  console.log(`\n導線: 通った ${okLinks} / 通らなかった ${ngLinks}`)
}

async function main() {
  const [cmd, arg] = process.argv.slice(2)
  const registry = readRegistry()
  const files = readGuideFiles()

  if (cmd === "hosts") {
    const checks = JSON.parse(readFileSync(OFFICIAL_URL_CHECK_PATH, "utf-8")) as Record<
      string,
      UrlCheckRecord
    >
    const hosts = buildHosts(registry, checks, files.hosts)
    writeGuideFiles({ ...files, hosts }, registry)
    const withTop = Object.values(hosts).filter((h) => h.top_url).length
    console.log(`市のホストの表: ${Object.keys(hosts).length} 件(トップあり ${withTop})`)
    return
  }

  if (cmd === "check" || cmd === "apply") {
    if (!arg) throw new Error("下書きのファイルを指定してください")
    const { draft, results } = await checkDraft(arg, files, registry)
    printResults(results)
    const reportIdx = process.argv.indexOf("--report")
    if (reportIdx >= 0) {
      const out = results.map((r) => ({
        ...r,
        links: r.links.map(({ link, ...rest }) => ({ ...rest, link })),
      }))
      writeFileSync(process.argv[reportIdx + 1], JSON.stringify(out, null, 2) + "\n")
    }
    if (cmd === "check") return

    const today = todayJst()
    const guides = { ...files.guides }
    let reviews = [...files.reviews]
    let written = 0
    for (const r of results) {
      const d = draft[r.slug]
      const links = r.links.filter((l) => l.ok && l.link).map((l) => l.link as GuideLink)
      const phoneOk = Boolean(d.phone && r.phone?.ok)
      // 下書きにある市は、いったん消してから書き直す(通らなかった導線を残さない)
      delete guides[r.slug]
      reviews = reviews.filter((x) => x.slug !== r.slug)
      if (links.length === 0 && !phoneOk) continue
      const entry: OfficialGuideEntry = {
        checked_at: today,
        links,
        phone:
          phoneOk && d.phone
            ? {
                dept_ja: d.phone.dept_ja,
                tel: d.phone.tel,
                note_ja: d.phone.note_ja,
                source_url: d.phone.source_url,
                checked_at: today,
              }
            : undefined,
        source: d.source,
      }
      guides[r.slug] = entry
      written++
      for (const rv of d.reviews) reviews.push({ slug: r.slug, due: rv.due, reason_ja: rv.reason_ja })
      if (phoneOk)
        reviews.push({
          slug: r.slug,
          due: PHONE_REVIEW_DUE,
          reason_ja: "担当課の電話番号の見直し(4月の組織の改正の前)",
        })
    }
    writeGuideFiles({ ...files, guides, reviews }, registry)
    console.log(`書いた市: ${written}`)
    return
  }

  if (cmd === "remove") {
    if (!arg) throw new Error("外す市の slug を指定してください")
    const what = process.argv[4]
    const guides = { ...files.guides }
    const entry = guides[arg]
    if (!entry) throw new Error(`導線がありません: ${arg}`)
    let reviews = [...files.reviews]
    if (!what) {
      delete guides[arg]
      reviews = reviews.filter((r) => r.slug !== arg)
    } else if (what === "phone") {
      guides[arg] = { ...entry, phone: undefined }
      reviews = reviews.filter((r) => !(r.slug === arg && r.due === PHONE_REVIEW_DUE))
    } else {
      guides[arg] = { ...entry, links: entry.links.filter((l) => l.kind !== what) }
    }
    const left = guides[arg]
    if (left && left.links.length === 0 && !left.phone) {
      delete guides[arg]
      reviews = reviews.filter((r) => r.slug !== arg)
    }
    writeGuideFiles({ ...files, guides, reviews }, registry)
    console.log(`外しました: ${arg}${what ? ` の ${what}` : ""}`)
    return
  }

  if (cmd === "report") {
    for (const e of registry) {
      const g = files.guides[e.slug]
      if (!g) continue
      const kinds = g.links.map((l) => l.kind).join(",")
      console.log(`${e.slug}\t${e.pref}${e.name_ja}\t${kinds}${g.phone ? "\t電話" : ""}\t${g.checked_at}`)
    }
    return
  }

  console.error(
    "使い方: npm run guides -- hosts | check <下書き.json> [--report <出力.json>] | apply <下書き.json> | remove <slug> [<種類>|phone] | report"
  )
  process.exit(1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
