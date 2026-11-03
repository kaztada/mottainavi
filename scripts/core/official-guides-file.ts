/**
 * 公式への導線の4つのファイルの読み書き。書く前に、全国レジストリと4つのファイル全体を検査する。
 * 形と検査の中身は src/lib/official-guides.ts(アプリと共通)。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  GuideReviewsFileSchema,
  GuideServicesFileSchema,
  MunicipalHostsFileSchema,
  OfficialGuidesFileSchema,
  assertOfficialGuides,
  type GuideFiles,
  hostOf,
  type GuideLink,
  type MunicipalHostsFile,
  type OfficialGuideEntry,
} from "../../src/lib/official-guides"
import type { RegistryEntry } from "../../src/lib/schemas"
import { DATA_DIR } from "./paths"

export const OFFICIAL_GUIDES_PATH = join(DATA_DIR, "official-guides.json")
export const MUNICIPAL_HOSTS_PATH = join(DATA_DIR, "municipal-hosts.json")
export const GUIDE_SERVICES_PATH = join(DATA_DIR, "official-guide-hosts.json")
export const GUIDE_REVIEWS_PATH = join(DATA_DIR, "guide-reviews.json")

const readJson = (path: string, empty: unknown): unknown =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : empty

export function readGuideFiles(): GuideFiles {
  return {
    guides: OfficialGuidesFileSchema.parse(readJson(OFFICIAL_GUIDES_PATH, {})),
    hosts: MunicipalHostsFileSchema.parse(readJson(MUNICIPAL_HOSTS_PATH, {})),
    services: GuideServicesFileSchema.parse(readJson(GUIDE_SERVICES_PATH, {})),
    reviews: GuideReviewsFileSchema.parse(readJson(GUIDE_REVIEWS_PATH, [])),
  }
}

/** 導線1件を決まった項目の順で書く(既定値と無い項目は書かない) */
function linkToJson(l: GuideLink): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind: l.kind,
    url: l.url,
    target: l.target,
    document: l.document,
    searchable: l.searchable,
  }
  if (l.label_ja) out.label_ja = l.label_ja
  if (l.label_en) out.label_en = l.label_en
  if (l.edition) out.edition = { value: l.edition.value, precision: l.edition.precision }
  if (l.partial) out.partial = true
  if (l.scope !== "whole") out.scope = l.scope
  if (l.document_url) out.document_url = l.document_url
  if (l.document_link_text) out.document_link_text = l.document_link_text
  if (l.document_sha256) out.document_sha256 = l.document_sha256
  if (l.known_stop_contexts && l.known_stop_contexts.length > 0)
    out.known_stop_contexts = [...l.known_stop_contexts]
  if (l.known_head_stop_contexts && l.known_head_stop_contexts.length > 0)
    out.known_head_stop_contexts = [...l.known_head_stop_contexts]
  if (l.final_url) out.final_url = l.final_url
  if (l.via) out.via = { id: l.via.id, linked_from: l.via.linked_from }
  return out
}

function entryToJson(e: OfficialGuideEntry): Record<string, unknown> {
  const out: Record<string, unknown> = { checked_at: e.checked_at }
  if (e.links.length > 0) out.links = e.links.map(linkToJson)
  if (e.phone) {
    const p: Record<string, unknown> = { dept_ja: e.phone.dept_ja, tel: e.phone.tel }
    if (e.phone.note_ja) p.note_ja = e.phone.note_ja
    p.source_url = e.phone.source_url
    p.checked_at = e.phone.checked_at
    out.phone = p
  }
  out.source = e.source
  return out
}

/**
 * 4つのファイルを JSON の文字列にする。キーはレジストリの順(全国地方公共団体コード順)、予定の表は
 * 日付・slug の順にそろえ、同じ内容なら同じ文字列になるようにする
 */
export function serializeGuideFiles(
  files: GuideFiles,
  registry: readonly RegistryEntry[]
): Record<"guides" | "hosts" | "services" | "reviews", string> {
  const guides: Record<string, unknown> = {}
  const hosts: Record<string, unknown> = {}
  for (const r of registry) {
    const g = files.guides[r.slug]
    if (g) guides[r.slug] = entryToJson(g)
    const h = files.hosts[r.slug]
    if (h) {
      const o: Record<string, unknown> = { top_url: h.top_url, hosts: [...h.hosts] }
      if (h.checked_at) o.checked_at = h.checked_at
      o.basis = h.basis
      hosts[r.slug] = o
    }
  }
  const services: Record<string, unknown> = {}
  for (const id of Object.keys(files.services).sort()) {
    const s = files.services[id]
    const o: Record<string, unknown> = {
      name_ja: s.name_ja,
      name_en: s.name_en,
      hosts: [...s.hosts],
      terms_url: s.terms_url,
      checked_at: s.checked_at,
    }
    if (s.note) o.note = s.note
    services[id] = o
  }
  const reviews = [...files.reviews]
    .sort((a, b) => a.due.localeCompare(b.due) || a.slug.localeCompare(b.slug))
    .map((r) => ({ slug: r.slug, due: r.due, reason_ja: r.reason_ja }))
  const text = (v: unknown) => JSON.stringify(v, null, 2) + "\n"
  return {
    guides: text(guides),
    hosts: text(hosts),
    services: text(services),
    reviews: text(reviews),
  }
}

/** 検査を通ったときだけ4つとも書く。通らなければ何も書かずに止める */
export function writeGuideFiles(
  files: GuideFiles,
  registry: readonly RegistryEntry[]
): void {
  const parsed: GuideFiles = {
    guides: OfficialGuidesFileSchema.parse(files.guides),
    hosts: MunicipalHostsFileSchema.parse(files.hosts),
    services: GuideServicesFileSchema.parse(files.services),
    reviews: GuideReviewsFileSchema.parse(files.reviews),
  }
  assertOfficialGuides(parsed, registry)
  const text = serializeGuideFiles(parsed, registry)
  writeFileSync(OFFICIAL_GUIDES_PATH, text.guides)
  writeFileSync(MUNICIPAL_HOSTS_PATH, text.hosts)
  writeFileSync(GUIDE_SERVICES_PATH, text.services)
  writeFileSync(GUIDE_REVIEWS_PATH, text.reviews)
}

export type UrlCheckRecord = {
  candidate: string
  checked_at: string
  ok: boolean
  final_url?: string
}

/**
 * 市のホストの表を作り直す。人が確かめて入れた行(basis が「自動:」で始まらない)はそのまま残す。
 * - 対応済みの市: official_url(市のごみのページ)のホスト。top_url は使わないので null
 * - 未対応の市: official_url と同じホストに行き着いた、確かめ済みの記録(official-url の確かめ)があれば、
 *   top_url = official_url、hosts = その記録の候補と行き先のホスト
 * - それ以外(official_url が無い、記録が無い): top_url は null、hosts は空(人が確かめて入れる)
 */
export function buildHosts(
  registry: readonly RegistryEntry[],
  checks: Record<string, UrlCheckRecord>,
  current: MunicipalHostsFile
): MunicipalHostsFile {
  const bySlug = new Map<string, UrlCheckRecord[]>()
  for (const [key, rec] of Object.entries(checks)) {
    const slug = key.split(" ", 1)[0]
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), rec])
  }
  const out: MunicipalHostsFile = {}
  for (const e of registry) {
    const kept = current[e.slug]
    if (kept && !kept.basis.startsWith("自動:")) {
      out[e.slug] = kept
      continue
    }
    if (e.status === "supported") {
      out[e.slug] = {
        top_url: null,
        hosts: e.official_url ? [hostOf(e.official_url)] : [],
        basis: "自動: 対応済みの市のごみのページ(official_url)のホスト",
      }
      continue
    }
    const url = e.official_url
    const recs = url
      ? (bySlug.get(e.slug) ?? []).filter(
          (r) => r.ok && r.final_url && hostOf(r.final_url) === hostOf(url)
        )
      : []
    if (!url || recs.length === 0) {
      out[e.slug] = {
        top_url: null,
        hosts: [],
        basis: "自動: 確かめた市のトップが無い(人が確かめて入れる)",
      }
      continue
    }
    const hosts = new Set<string>([hostOf(url)])
    for (const r of recs) {
      hosts.add(hostOf(r.candidate))
      if (r.final_url) hosts.add(hostOf(r.final_url))
    }
    out[e.slug] = {
      top_url: url,
      hosts: [...hosts].sort(),
      checked_at: recs.map((r) => r.checked_at).sort()[0],
      basis: "自動: official-url の確かめ(Wikidata の候補に1回接続、data-model §30)",
    }
  }
  return out
}
