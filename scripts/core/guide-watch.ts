/**
 * 公式への導線の見張り(月1回)と、見直しの予定日の確認(毎日)の、ネットワークに出ない部分。
 * 見張る対象の組み立て、前の月の状態の引き継ぎ、Issue の本文の組み立て。
 * 取得と Issue の作成は scripts/check-guides.ts とワークフロー(.github/workflows/check-guides.yml)。
 */
import type { GuideFiles, GuideReview } from "../../src/lib/official-guides"
import type { RegistryEntry } from "../../src/lib/schemas"
import { VERDICT_LABELS, type Judgement, type Verdict, type WatchTarget } from "./guide-check"

/** 見張る対象(ページに出る全部の URL)。資料は、資料を載せたページの URL を pageUrl に持つ */
export type PlannedTarget = WatchTarget & { pageUrl?: string }

export function buildTargets(
  registry: readonly RegistryEntry[],
  files: GuideFiles
): PlannedTarget[] {
  const out: PlannedTarget[] = []
  for (const e of registry) {
    if (e.status === "supported") continue
    const h = files.hosts[e.slug]
    const cityHosts = h?.hosts ?? []
    const names = [e.name_ja]
    if (h?.top_url)
      out.push({ slug: e.slug, role: "top", url: h.top_url, names, allowedHosts: cityHosts })
    const g = files.guides[e.slug]
    if (!g) continue
    for (const l of g.links) {
      const service = l.via ? files.services[l.via.id] : undefined
      const allowedHosts = [...cityHosts, ...(service?.hosts ?? [])]
      out.push({
        slug: e.slug,
        role: "guide",
        url: l.url,
        names,
        allowedHosts,
        expectedFinalUrl: l.via ? (l.final_url ?? l.url) : undefined,
        expectedSha256: l.target === "pdf" ? l.document_sha256 : undefined,
        knownStopContexts: l.known_stop_contexts,
      })
      if (l.document_url)
        out.push({
          slug: e.slug,
          role: "document",
          url: l.document_url,
          pageUrl: l.url,
          names,
          allowedHosts,
          expectedDocumentUrl: l.document_url,
          expectedDocumentLinkText: l.document_link_text,
          expectedSha256: l.document_sha256,
        })
      if (l.via)
        out.push({
          slug: e.slug,
          role: "linked-from",
          url: l.via.linked_from,
          names,
          allowedHosts: cityHosts,
          mustLinkTo: l.url,
        })
    }
  }
  return out
}

export type WatchResult = { target: PlannedTarget; judgement: Judgement }

/** Issue の本文に残す状態(機械が読む形)。「取得できない」が何か月続いているか */
export type WatchState = {
  /** この状態を作った月(YYYY-MM) */
  month: string
  /** その月より前の月までの続いた数(同じ月にやり直したときは、これに足し直す) */
  base: Record<string, number>
  /** その月までの続いた数 */
  streak: Record<string, number>
}

const STATE_RE = /<!-- guide-watch-state (\{[\s\S]*?\}) -->/

export function parseState(body: string | null | undefined): WatchState | null {
  const m = body?.match(STATE_RE)
  if (!m) return null
  try {
    const s = JSON.parse(m[1]) as WatchState
    return typeof s.month === "string" && s.streak && s.base ? s : null
  } catch {
    return null
  }
}

/**
 * 「取得できない」の続いた月の数。同じ月の手動のやり直しは数えない(前の月までの数に足し直す)。
 * 正常などに戻った URL は消す
 */
/** 前の月(YYYY-MM) */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`
}

export function nextState(
  prev: WatchState | null,
  month: string,
  unreachableUrls: readonly string[]
): WatchState {
  // 同じ月のやり直しは前の月までの数に足し直す。前の月の状態でなければ(見張らなかった月を挟んだ)数え直す
  const base = !prev
    ? {}
    : prev.month === month
      ? prev.base
      : prev.month === previousMonth(month)
        ? prev.streak
        : {}
  const streak: Record<string, number> = {}
  for (const url of [...new Set(unreachableUrls)].sort()) streak[url] = (base[url] ?? 0) + 1
  return { month, base, streak }
}

/** 見張りの Issue の題名(ワークフローが探す) */
export const WATCH_ISSUE_TITLE = "公式への導線: リンクを確かめてください"
export const REVIEW_ISSUE_TITLE = "公式への導線: 見直しの予定日が来ました"

const ROLE_LABELS: Record<WatchTarget["role"], string> = {
  top: "市のトップ(公式サイトを見る)",
  guide: "導線",
  document: "導線の中の資料",
  "linked-from": "外部のサイトを案内している市のページ",
}

const ORDER: Verdict[] = [
  "suspect-redirect",
  "suspect-content",
  "broken",
  "changed",
  "review",
  "unreachable",
]

/**
 * 人が見るものがあるか(無ければ Issue は作らない・閉じる)。証明書の連鎖の不足だけで取得できないものは数えない
 * (Linux の curl では毎月同じ市で起きる。手元の Mac なら確かめられる。本文には畳んで残す)
 */
export function needsAttention(results: readonly WatchResult[]): boolean {
  return results.some((r) => r.judgement.verdict !== "ok" && !r.judgement.tlsChain)
}

/** 月の数を数える「取得できない」(証明書の連鎖の不足は除く) */
export function unreachableForStreak(results: readonly WatchResult[]): string[] {
  return results
    .filter((r) => r.judgement.verdict === "unreachable" && !r.judgement.tlsChain)
    .map((r) => r.target.url)
}

export function renderWatchBody(
  results: readonly WatchResult[],
  state: WatchState,
  checkedAt: string
): string {
  const by = new Map<Verdict, WatchResult[]>()
  for (const r of results) by.set(r.judgement.verdict, [...(by.get(r.judgement.verdict) ?? []), r])
  const count = (v: Verdict) => by.get(v)?.length ?? 0
  const lines: string[] = [
    `月1回のリンクの見張り(${checkedAt})の結果です。docs/tech-stack.md の「公式への導線の見張り」の節の手順で確かめてください。`,
    "",
    `- 見た URL: ${results.length} / 正常 ${count("ok")}`,
    ...ORDER.filter((v) => count(v) > 0).map((v) => `- ${VERDICT_LABELS[v]}: ${count(v)}`),
    "",
  ]
  if (count("suspect-redirect") + count("suspect-content") > 0)
    lines.push(
      "**誤案内の疑いがあります。** 人が確かめて、その市の導線(または市のトップ)を待たずに外してください(デプロイを1回足してよい。2026-11-04 Kaz 判断)。",
      ""
    )
  for (const v of ORDER) {
    const all = by.get(v)
    if (!all) continue
    const rs = all.filter((r) => !r.judgement.tlsChain)
    const chain = all.filter((r) => r.judgement.tlsChain)
    if (chain.length > 0) {
      lines.push(
        `<details><summary>証明書の連鎖の不足で、Linux の取得では確かめられない(${chain.length})</summary>`,
        "",
        "市のサイトが中間証明書を送っていないため、GitHub Actions(Linux の curl)では確かめられません。手元の Mac の curl なら確かめられます(data-model §30)。導線を足す・直すときに手元で確かめてください。",
        "",
        ...chain.map((r) => `- \`${r.target.slug}\` ${ROLE_LABELS[r.target.role]}: ${r.target.url}`),
        "",
        "</details>",
        ""
      )
    }
    if (rs.length === 0) continue
    lines.push(`## ${VERDICT_LABELS[v]}(${rs.length})`, "")
    for (const r of rs) {
      const months = v === "unreachable" ? state.streak[r.target.url] : undefined
      const streakNote = months && months >= 2 ? ` **${months}か月続いています。手元の Mac で確かめてください**` : ""
      lines.push(
        `- \`${r.target.slug}\` ${ROLE_LABELS[r.target.role]}: ${r.target.url}${streakNote}`,
        ...r.judgement.reasons.map((x) => `  - ${x}`)
      )
    }
    lines.push("")
  }
  lines.push(`<!-- guide-watch-state ${JSON.stringify(state)} -->`)
  return lines.join("\n") + "\n"
}

// ---- 見直しの予定日(毎日、ネットワークに出ない) ----

const NOTIFIED_RE = /<!-- guide-reviews-notified (\[[\s\S]*?\]) -->/

export const reviewKey = (r: GuideReview) => `${r.slug}|${r.due}|${r.reason_ja}`

export function parseNotified(body: string | null | undefined): string[] {
  const m = body?.match(NOTIFIED_RE)
  if (!m) return []
  try {
    const v = JSON.parse(m[1]) as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

/** 予定日が来た(当日を含む)のに、まだ知らせていない予定 */
export function dueReviews(
  reviews: readonly GuideReview[],
  today: string,
  notified: readonly string[]
): GuideReview[] {
  const done = new Set(notified)
  return reviews.filter((r) => r.due <= today && !done.has(reviewKey(r)))
}

export function renderReviewsBody(
  due: readonly GuideReview[],
  notified: readonly string[],
  names: ReadonlyMap<string, string>
): { body: string; comment: string } {
  const all = [...new Set([...notified, ...due.map(reviewKey)])].sort()
  const comment = [
    `見直しの予定日が来た市が ${due.length} 件あります(data/guide-reviews.json)。`,
    "",
    ...due.map((r) => `- ${r.due} \`${r.slug}\`(${names.get(r.slug) ?? r.slug}): ${r.reason_ja}`),
    "",
    "見直したら、data/official-guides.json(導線・電話)と data/guide-reviews.json(次の予定日)を次の PR で直してください。",
  ].join("\n")
  const body = [
    "公式への導線の見直しの予定日を、毎日確かめています(ネットワークには出ません)。予定日が来た市はコメントで知らせます。",
    "",
    `知らせた予定: ${all.length} 件`,
    "",
    `<!-- guide-reviews-notified ${JSON.stringify(all)} -->`,
  ].join("\n")
  return { body: body + "\n", comment: comment + "\n" }
}
