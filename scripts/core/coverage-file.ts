/**
 * 仕分けの台帳(data/coverage.json)の読み書き。書く前に、全国レジストリと台帳の全体を検査する。
 * 形と検査の中身は src/lib/coverage.ts(アプリと共通)。
 */
import { readFileSync, writeFileSync } from "node:fs"
import {
  CoverageFileSchema,
  assertCoverageMatchesRegistry,
  type CoverageEntry,
  type CoverageFile,
} from "../../src/lib/coverage"
import { RegistryFileSchema, type RegistryEntry } from "../../src/lib/schemas"
import { COVERAGE_PATH, REGISTRY_PATH } from "./paths"

export function readRegistry(path = REGISTRY_PATH): RegistryEntry[] {
  return RegistryFileSchema.parse(JSON.parse(readFileSync(path, "utf-8")))
}

export function readCoverage(path = COVERAGE_PATH): CoverageFile {
  return CoverageFileSchema.parse(JSON.parse(readFileSync(path, "utf-8")))
}

/** 1件を決まった項目の順で書く(空の配列・無い項目は書かない) */
function entryToJson(e: CoverageEntry): Record<string, unknown> {
  const out: Record<string, unknown> = { status: e.status }
  if (e.checked_at) out.checked_at = e.checked_at
  if (e.detail_ja) out.detail_ja = e.detail_ja
  if (e.detail_en) out.detail_en = e.detail_en
  if (e.evidence.length > 0) out.evidence = e.evidence
  if (e.searched.length > 0) out.searched = e.searched
  if (e.note) out.note = e.note
  return out
}

/**
 * 台帳を JSON の文字列にする。キーはレジストリの順(全国地方公共団体コード順)にそろえ、
 * 同じ内容なら同じ文字列になるようにする(差分が読みやすく、同じ操作を2回しても変わらない)
 */
export function serializeCoverage(
  coverage: CoverageFile,
  registry: readonly RegistryEntry[]
): string {
  const ordered: Record<string, unknown> = {}
  for (const e of registry) {
    const c = coverage[e.slug]
    if (c) ordered[e.slug] = entryToJson(c)
  }
  return JSON.stringify(ordered, null, 2) + "\n"
}

/** 検査を通ったときだけ書く。通らなければ何も書かずに止める */
export function writeCoverage(
  coverage: CoverageFile,
  registry: readonly RegistryEntry[],
  path = COVERAGE_PATH
): void {
  const parsed = CoverageFileSchema.parse(coverage)
  assertCoverageMatchesRegistry(parsed, registry)
  writeFileSync(path, serializeCoverage(parsed, registry))
}
