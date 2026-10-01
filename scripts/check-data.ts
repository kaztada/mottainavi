/**
 * PR の自動検査(CI とローカルで同じコマンド)。
 *
 * 実行: npm run build-data -- --all   ← 先にパイプラインを実行しておく
 *       npm run check-data -- [--base <git ref>] [--report <path>]
 *   --base: 比較元(既定 origin/main)。この時点と比べて「変わる品目」と版番号を検査する
 *   --report: レポート(Markdown)を書き出すパス。CI では PR コメントに使う
 *
 * 検査A 再現性: コミットされた items.json / id-map.json が、パイプラインの出力と一致すること
 *              (作り直し忘れ・手での書き換え・共通コードの変更による他市への波及を検出)
 * 検査B 版番号: 品目データの中身が比較元から変わった自治体は、data_version も変わっていること
 * レポート    : 自治体ごとの「変わる品目」の一覧(合否には使わない)
 */
import { execFileSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { relative } from "node:path"
import { ItemsFileSchema, MunicipalityMetaSchema } from "../src/lib/schemas"
import type { ItemsFile } from "../src/lib/schemas"
import { ADAPTERS } from "./adapters"
import {
  diffItems,
  isEmptyDiff,
  needsVersionBump,
  renderDiff,
  sameContent,
} from "./core/data-check"
import { ROOT, municipalityFile } from "./core/paths"

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

/** git の特定時点のファイル内容。その時点に無ければ null */
function gitShow(ref: string, absPath: string): string | null {
  const path = relative(ROOT, absPath)
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], {
      cwd: ROOT,
      encoding: "utf-8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return null
  }
}

const parseItems = (text: string): ItemsFile =>
  ItemsFileSchema.parse(JSON.parse(text))

function main() {
  const base = argValue("--base") ?? "origin/main"
  const reportPath = argValue("--report")
  const errors: string[] = []
  const sections: string[] = []

  for (const slug of Object.keys(ADAPTERS)) {
    const itemsPath = municipalityFile(slug, "items.json")
    const idMapPath = municipalityFile(slug, "id-map.json")
    const metaPath = municipalityFile(slug, "municipality.json")
    if (!existsSync(itemsPath)) {
      errors.push(`${slug}: items.json がありません(build-data を実行してください)`)
      continue
    }
    const work = parseItems(readFileSync(itemsPath, "utf-8"))

    // 検査A: 再現性(作業ツリー=パイプラインの出力 と、コミット済みの内容)
    const headItems = gitShow("HEAD", itemsPath)
    if (headItems === null) {
      errors.push(`${slug}: items.json がコミットされていません`)
    } else if (!sameContent(work, parseItems(headItems))) {
      const d = diffItems(parseItems(headItems).items, work.items)
      errors.push(
        `${slug}: コミットされた items.json がパイプラインの出力と違います(追加 ${d.added.length} / 削除 ${d.removed.length} / 変更 ${d.changed.length})。\`npm run build-data -- --all\` の結果をコミットしてください`
      )
    }
    const headIdMap = gitShow("HEAD", idMapPath)
    if (headIdMap !== null && headIdMap !== readFileSync(idMapPath, "utf-8")) {
      errors.push(
        `${slug}: コミットされた id-map.json がパイプラインの出力と違います(品目IDの採番が変わっています)`
      )
    }

    // 検査B とレポート: 比較元からの変化
    const baseItems = gitShow(base, itemsPath)
    if (baseItems === null) {
      sections.push(`### ${slug}: 新しい自治体(${work.items.length} 品目)`)
      continue
    }
    const before = parseItems(baseItems)
    const diff = diffItems(before.items, work.items)
    if (!isEmptyDiff(diff)) sections.push(renderDiff(slug, diff))

    const baseMeta = gitShow(base, metaPath)
    const headVersion = MunicipalityMetaSchema.parse(
      JSON.parse(readFileSync(metaPath, "utf-8"))
    ).data_version
    const baseVersion = baseMeta
      ? MunicipalityMetaSchema.parse(JSON.parse(baseMeta)).data_version
      : null
    if (
      needsVersionBump({
        contentChanged: !sameContent(before, work),
        baseVersion,
        headVersion,
      })
    ) {
      errors.push(
        `${slug}: 品目データが変わっていますが data_version が ${headVersion} のままです。municipality.json の data_version を上げてください(上げないと、一度見たブラウザに古いデータが残ります)`
      )
    }
  }

  const report = [
    "## データの検査",
    "",
    errors.length === 0
      ? "✅ 再現性・版番号の検査に合格"
      : ["❌ 検査に失敗", "", ...errors.map((e) => `- ${e}`)].join("\n"),
    "",
    `## 変わる品目(比較元: ${base})`,
    "",
    sections.length === 0
      ? "品目データの変更はありません。"
      : sections.join("\n\n"),
    "",
  ].join("\n")

  console.log(report)
  if (reportPath) writeFileSync(reportPath, report, "utf-8")
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n", "utf-8")
  }
  if (errors.length > 0) process.exit(1)
}

main()
