import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { municipalityFile } from "../core/paths"
import { type StandardCsvAdapter, checkConfig } from "../core/standard-csv"
import { ADAPTERS } from "./index"

/**
 * 共通アダプタ(標準形式 CSV)で登録した全自治体の、設定と categories.json の整合を検査する。
 * 自治体を足すとここに自動で含まれるので、自治体ごとのテストは書かなくてよい。
 */
const standard = Object.values(ADAPTERS).filter(
  (a): a is StandardCsvAdapter => "config" in a
)

describe("標準形式 CSV の設定と categories.json の整合", () => {
  it("共通アダプタを使う自治体が登録されている", () => {
    expect(standard.length).toBeGreaterThan(0)
  })
  it.each(standard.map((a) => [a.slug, a] as const))("%s", (slug, adapter) => {
    const categories = JSON.parse(
      readFileSync(municipalityFile(slug, "categories.json"), "utf-8")
    )
    expect(checkConfig(adapter.config, categories)).toEqual([])
  })
})
