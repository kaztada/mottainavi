/**
 * データ更新の見張り(tech-stack.md §17)。各市の掲載ページ(または BODIK の API)を1回ずつ見て、
 * データが更新されていれば取り直して作り直す。週1回、GitHub Actions から実行する。
 *
 * 実行: npm run update-data -- --all                    確認だけ(何も書き換えない)
 *       npm run update-data -- --all --apply            更新があった市を作り直す
 *       npm run update-data -- --municipality <slug> [--apply]
 *   --report <path>: 報告(PR の本文)を書き出す
 *   --issues <path>: 対応が必要なものの一覧(Issue の本文)を書き出す。無ければ書かない
 *
 * --apply は data/ に未コミットの変更が無い状態で実行する(失敗した市は git で元に戻すため)。
 * 市のサイトへのアクセスは、確認が1市につき1回、データの取得は更新があったときだけ1回。
 */
import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
import { ItemsFileSchema } from "../src/lib/schemas"
import type { ItemsFile } from "../src/lib/schemas"
import { WATCH_WORDS } from "./tools/gomisaku"
import { ADAPTERS } from "./adapters"
import { diffItems, sameContent } from "./core/data-check"
import { ROOT, municipalityFile } from "./core/paths"
import { runPipeline } from "./core/pipeline"
import { readSource, writeSource } from "./core/source"
import type { MunicipalityAdapter } from "./core/types"
import {
  type UpdateOutcome,
  countProblem,
  nextDataVersion,
  renderReport,
  todayJst,
} from "./core/update"
import { checkWatch } from "./core/watch"

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf-8" })

const readItems = (slug: string): ItemsFile =>
  ItemsFileSchema.parse(
    JSON.parse(readFileSync(municipalityFile(slug, "items.json"), "utf-8"))
  )

/** その市の変更をすべて取り消す(失敗時)。コミット済みの状態に戻す */
function restore(slug: string) {
  git("checkout", "--", `data/municipalities/${slug}`)
  try {
    git("checkout", "--", `data/cache/${slug}*`)
  } catch {
    // キャッシュがコミットされていない市は、戻すものが無い
  }
}

async function update(
  adapter: MunicipalityAdapter,
  apply: boolean,
  today: string
): Promise<UpdateOutcome> {
  const slug = adapter.slug
  if (!adapter.watch) return { slug, status: "unwatched" }
  const state = readSource(slug)

  let detected
  try {
    detected = await checkWatch(adapter.watch)
  } catch (err) {
    return { slug, status: "check-failed", reason: String(err) }
  }
  if (detected.fingerprint === state.fingerprint) {
    return { slug, status: "unchanged" }
  }
  const fileUrl = detected.fileUrl ?? state.file_url
  if (!apply) {
    return {
      slug,
      status: "changed",
      before: state.fingerprint,
      after: detected.fingerprint,
    }
  }

  // 初回: 取得元の URL が同じなら、目印を記録するだけ(データは取り直さない)
  if (state.fingerprint === "" && fileUrl === state.file_url) {
    writeSource(slug, { file_url: fileUrl, fingerprint: detected.fingerprint })
    return { slug, status: "recorded" }
  }
  if (adapter.manualUpdateReason) {
    return {
      slug,
      status: "needs-attention",
      reason: `${adapter.manualUpdateReason}(新しい取得元: ${fileUrl})`,
    }
  }

  const before = readItems(slug)
  try {
    writeSource(slug, { file_url: fileUrl, fingerprint: detected.fingerprint })
    const result = await runPipeline(adapter, { refresh: true })
    if (!result.ok) {
      throw new Error(
        "作り直しが完了条件を満たしませんでした(新しい区分名、注意文言の欠落など。実行ログを確認してください)"
      )
    }
    const after = readItems(slug)
    const problem = countProblem(
      before.items.length,
      after.items.length,
      adapter.expectedMinItems
    )
    if (problem) throw new Error(problem)

    if (sameContent(before, after)) {
      // 品目データは同じ。generated_at だけの差分は残さない
      git("checkout", "--", `data/municipalities/${slug}/items.json`)
      return { slug, status: "refreshed" }
    }
    const metaPath = municipalityFile(slug, "municipality.json")
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"))
    meta.data_version = nextDataVersion(meta.data_version, today)
    meta.data_fetched_at = today
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf-8")
    return {
      slug,
      status: "updated",
      diff: diffItems(before.items, after.items),
      version: meta.data_version,
    }
  } catch (err) {
    restore(slug)
    return {
      slug,
      status: "needs-attention",
      reason: `${err instanceof Error ? err.message : String(err)}(新しい取得元: ${fileUrl})`,
    }
  }
}

async function main() {
  const apply = process.argv.includes("--apply")
  const all = process.argv.includes("--all")
  const slug = argValue("--municipality")
  const targets = all ? Object.values(ADAPTERS) : slug ? [ADAPTERS[slug]] : []
  if (targets.length === 0 || targets.some((a) => !a)) {
    console.error(
      `--municipality <slug> または --all を指定してください。登録済み: ${Object.keys(ADAPTERS).join(", ")}`
    )
    process.exit(1)
  }
  if (apply && git("status", "--porcelain", "--", "data").trim() !== "") {
    console.error(
      "data/ に未コミットの変更があります。コミットするか元に戻してから --apply を実行してください"
    )
    process.exit(1)
  }

  const today = todayJst()
  const outcomes: UpdateOutcome[] = []
  for (const adapter of targets) {
    outcomes.push(await update(adapter, apply, today))
  }

  const report = renderReport(outcomes, WATCH_WORDS, today)
  console.log("\n" + report.body)
  const reportPath = argValue("--report")
  if (reportPath) writeFileSync(reportPath, report.body, "utf-8")
  const issuesPath = argValue("--issues")
  if (issuesPath && report.needsAttention) {
    writeFileSync(issuesPath, report.attention, "utf-8")
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.body, "utf-8")
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `changed=${report.hasChanges}\nneeds_attention=${report.needsAttention}\ntitle=${report.title}\n`,
      "utf-8"
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
