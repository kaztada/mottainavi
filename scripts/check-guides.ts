/**
 * 公式への導線の見張り(docs/tech-stack.md の「公式への導線の見張り」の節)。
 *
 *   npm run check-guides -- [--previous <前の Issue の本文>] [--out <Issue の本文の出力先>] [--limit <件数>]
 *       月1回のリンクの見張り。ページに出る全部の URL(導線・中の資料・紹介元・市のトップ)を、
 *       その実行で1回ずつ取り直して判定する(scripts/core/guide-check.ts の判定の表)。
 *       標準出力に {"attention": 正常でないものがあるか, "counts": …} を出す。自動では直さない
 *       --roles top,guide,document,linked-from  見張る対象の種類をしぼる
 *       --cached  取り直さず、記録にある結果で判定する(手元で判定を確かめるとき。見張りでは使わない)。
 *                 市のサイトには出ない(記録や保存した本文の無い URL は「要確認」にする)
 *   npm run check-guides -- reviews [--previous <前の Issue の本文>] [--out <本文>] [--comment <コメント>]
 *       見直しの予定日の確認(毎日。ネットワークに出ない)。標準出力に {"due": 予定日が来た件数}
 *
 * 取得は politeFetch(ホストごとに同時1件・2.5秒以上あける)。見張りの実行(run)の中では、記録があっても
 * 転送先も含めて1回ずつ取り直し、同じ URL は2回取らない。
 */
import { readFileSync, writeFileSync } from "node:fs"
import { todayJst } from "../src/lib/coverage"
import { readRegistry } from "./core/coverage-file"
import { judge, type FetchOutcome, type Verdict } from "./core/guide-check"
import {
  buildTargets,
  dueReviews,
  needsAttention,
  nextState,
  parseNotified,
  parseState,
  renderReviewsBody,
  renderWatchBody,
  unreachableForStreak,
  type WatchResult,
} from "./core/guide-watch"
import { readGuideFiles } from "./core/official-guides-file"
import { OFFLINE_REFUSAL, createFetchRun, politeFetch, type FetchRun } from "./core/polite-fetch"

const CACHED = process.argv.includes("--cached")
// --cached では市のサイトに出ない(politeFetch は記録と保存した本文のある URL だけを返す。CI と同じ作り)
if (CACHED) process.env.MOTTAINAVI_OFFLINE = "1"

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

const readOptional = (path: string | null) => {
  if (!path) return null
  try {
    return readFileSync(path, "utf-8")
  } catch {
    return null
  }
}

/**
 * 1件取って判定の形にする。missing は、記録が無い・本文を保存した記録なのに本文のファイルが無い
 * (--cached で、記録だけでは判定できないもの。失敗の記録も、本文があれば題名の停止の告知を見るので)
 */
async function fetchOutcome(
  url: string,
  run: FetchRun | undefined
): Promise<{ outcome: FetchOutcome; missing: boolean }> {
  try {
    const { record, body } = await politeFetch(url, run ? { run } : {})
    return {
      outcome: {
        status: record.status,
        final_url: record.final_url,
        content_type: record.content_type,
        error: record.error,
        body,
        sha256: record.sha256,
      },
      missing: Boolean(record.file) && !body,
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return {
      outcome: { status: 0, final_url: url, content_type: null, error, body: null, sha256: null },
      missing: error.startsWith(OFFLINE_REFUSAL),
    }
  }
}

async function watch() {
  const registry = readRegistry()
  const files = readGuideFiles()
  let targets = buildTargets(registry, files)
  const limit = Number(argValue("--limit") ?? NaN)
  const roles = argValue("--roles")?.split(",")
  if (roles) targets = targets.filter((t) => roles.includes(t.role))
  if (Number.isFinite(limit)) targets = targets.slice(0, limit)
  const run = CACHED ? undefined : createFetchRun()
  const results: WatchResult[] = new Array(targets.length)
  let next = 0
  const worker = async () => {
    while (next < targets.length) {
      const i = next++
      const t = targets[i]
      const got = await fetchOutcome(t.url, run)
      const page = t.pageUrl ? await fetchOutcome(t.pageUrl, run) : undefined
      results[i] = {
        target: t,
        judgement:
          got.missing || page?.missing
            ? { verdict: "review", reasons: ["保存した記録か本文がありません(--cached では取りに行かない)"] }
            : judge(t, got.outcome, page?.outcome),
      }
      if (i % 50 === 0) process.stderr.write(`${i}/${targets.length}\n`)
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))

  const today = todayJst()
  const prev = parseState(readOptional(argValue("--previous")))
  const state = nextState(prev, today.slice(0, 7), unreachableForStreak(results))
  const out = argValue("--out")
  if (out) writeFileSync(out, renderWatchBody(results, state, today))
  const counts: Partial<Record<Verdict, number>> = {}
  for (const r of results) counts[r.judgement.verdict] = (counts[r.judgement.verdict] ?? 0) + 1
  console.log(JSON.stringify({ attention: needsAttention(results), total: results.length, counts }))
}

function reviews() {
  const registry = readRegistry()
  const files = readGuideFiles()
  const notified = parseNotified(readOptional(argValue("--previous")))
  const due = dueReviews(files.reviews, todayJst(), notified)
  const names = new Map(registry.map((e) => [e.slug, `${e.pref}${e.name_ja}`]))
  const { body, comment } = renderReviewsBody(due, notified, names)
  const out = argValue("--out")
  const commentPath = argValue("--comment")
  if (out) writeFileSync(out, body)
  if (commentPath) writeFileSync(commentPath, comment)
  console.log(JSON.stringify({ due: due.length }))
}

const main = process.argv[2] === "reviews" ? async () => reviews() : watch
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
