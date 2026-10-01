import { describe, expect, it } from "vitest"
import type { Item, ItemsFile } from "../../src/lib/schemas"
import {
  describeItemChange,
  diffItems,
  isEmptyDiff,
  needsVersionBump,
  renderDiff,
  sameContent,
} from "./data-check"

const item = (over: Partial<Item> = {}): Item => ({
  id: "tst-0001",
  name_ja: "タンス",
  name_kana: "たんす",
  name_romaji: "tansu",
  aliases: [],
  dispositions: [
    { category_id: "sodai", note_ja: null, official_link: null },
  ],
  sodai_fee_yen: null,
  reuse_category: null,
  name_en: null,
  ...over,
})

const file = (items: Item[], generated_at = "2026-01-01T00:00:00Z"): ItemsFile => ({
  municipality_id: "test-city",
  generated_at,
  source_url: "https://example.com/",
  item_count: items.length,
  items,
})

describe("sameContent", () => {
  it("generated_at だけの違いは同じとみなす", () => {
    expect(sameContent(file([item()], "a"), file([item()], "b"))).toBe(true)
  })
  it("品目の中身が違えば違うとみなす", () => {
    expect(
      sameContent(file([item()]), file([item({ reuse_category: "furniture" })]))
    ).toBe(false)
  })
})

describe("describeItemChange", () => {
  it("手放し方・区分・注意文言の変化を説明する", () => {
    const after = item({
      reuse_category: "furniture",
      dispositions: [
        { category_id: "funen", note_ja: "50cm以内", official_link: null },
      ],
    })
    expect(describeItemChange(item(), after)).toEqual([
      "手放し方: なし → furniture",
      "区分: sodai → funen",
      "注意文言が変更",
    ])
  })
  it("変化がなければ空", () => {
    expect(describeItemChange(item(), item())).toEqual([])
  })
})

describe("diffItems", () => {
  it("品目IDで突き合わせて追加・削除・変更を出す", () => {
    const before = [item(), item({ id: "tst-0002", name_ja: "机" })]
    const after = [
      item({ reuse_category: "furniture" }),
      item({ id: "tst-0003", name_ja: "ソファ" }),
    ]
    const d = diffItems(before, after)
    expect(d.added.map((i) => i.name_ja)).toEqual(["ソファ"])
    expect(d.removed.map((i) => i.name_ja)).toEqual(["机"])
    expect(d.changed).toEqual([
      { id: "tst-0001", name: "タンス", details: ["手放し方: なし → furniture"] },
    ])
    expect(isEmptyDiff(d)).toBe(false)
    expect(isEmptyDiff(diffItems(before, before))).toBe(true)
  })
})

describe("needsVersionBump", () => {
  it("中身が変わって版番号が同じなら、上げる必要がある", () => {
    expect(
      needsVersionBump({
        contentChanged: true,
        baseVersion: "20260923",
        headVersion: "20260923",
      })
    ).toBe(true)
  })
  it("版番号を上げていれば合格", () => {
    expect(
      needsVersionBump({
        contentChanged: true,
        baseVersion: "20260923",
        headVersion: "20260925",
      })
    ).toBe(false)
  })
  it("中身が変わっていなければ合格", () => {
    expect(
      needsVersionBump({
        contentChanged: false,
        baseVersion: "20260923",
        headVersion: "20260923",
      })
    ).toBe(false)
  })
  it("新しい自治体(比較元に無い)は対象外", () => {
    expect(
      needsVersionBump({
        contentChanged: true,
        baseVersion: null,
        headVersion: "20260925",
      })
    ).toBe(false)
  })
})

describe("renderDiff", () => {
  it("件数の見出しと品目ごとの行を出し、長いときは打ち切る", () => {
    const before = Array.from({ length: 70 }, (_, n) =>
      item({ id: `tst-${String(n).padStart(4, "0")}`, name_ja: `品目${n}` })
    )
    const after = before.map((i) => ({ ...i, reuse_category: "furniture" as const }))
    const md = renderDiff("test-city", diffItems(before, after))
    expect(md).toContain("### test-city: 追加 0 / 削除 0 / 変更 70")
    expect(md).toContain("- 変更: 品目0(tst-0000) — 手放し方: なし → furniture")
    expect(md).toContain("…ほか 10 件")
  })
})
