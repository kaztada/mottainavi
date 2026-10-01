import { describe, expect, it } from "vitest"
import type { Item } from "../../src/lib/schemas"
import { diffItems } from "./data-check"
import {
  type UpdateOutcome,
  countProblem,
  hazardLines,
  nextDataVersion,
  renderReport,
  todayJst,
} from "./update"

const WATCH = /電池|スプレー/

const item = (over: Partial<Item> = {}): Item => ({
  id: "tst-0001",
  name_ja: "タンス",
  name_kana: "たんす",
  name_romaji: "tansu",
  aliases: [],
  dispositions: [{ category_id: "sodai", note_ja: null, official_link: null }],
  sodai_fee_yen: null,
  reuse_category: null,
  name_en: null,
  ...over,
})

describe("todayJst / nextDataVersion", () => {
  it("日本時間の日付を返す(UTC では前日の夜でも)", () => {
    expect(todayJst(new Date("2026-10-04T21:00:00Z"))).toBe("2026-10-05")
  })
  it("版番号は今日の日付。同じ日に2回目なら連番を付けて必ず変える", () => {
    expect(nextDataVersion("20260925", "2026-10-05")).toBe("20261005")
    expect(nextDataVersion("20261005", "2026-10-05")).toBe("20261005-2")
    expect(nextDataVersion("20261005-2", "2026-10-05")).toBe("20261005-3")
  })
})

describe("countProblem", () => {
  it("下限未満と10%超の増減を止める", () => {
    expect(countProblem(1000, 990, 900)).toBeNull()
    expect(countProblem(1000, 850, 900)).toContain("下限")
    expect(countProblem(1000, 1150, 900)).toContain("10%")
    expect(countProblem(1000, 899, 800)).toContain("10%")
  })
})

describe("hazardLines", () => {
  it("危険物の語を含む品目の追加・削除・変更だけを拾う", () => {
    const before = [
      item(),
      item({ id: "tst-0002", name_ja: "充電式電池" }),
      item({ id: "tst-0003", name_ja: "スプレー缶" }),
    ]
    const after = [
      item({ reuse_category: "furniture" }),
      item({
        id: "tst-0002",
        name_ja: "充電式電池",
        dispositions: [{ category_id: "fuka", note_ja: null, official_link: null }],
      }),
      item({ id: "tst-0004", name_ja: "ボタン電池" }),
    ]
    expect(hazardLines(diffItems(before, after), WATCH)).toEqual([
      "追加: ボタン電池",
      "削除: スプレー缶",
      "変更: 充電式電池 — 区分: sodai → fuka",
    ])
  })
})

describe("renderReport", () => {
  const diff = diffItems(
    [item({ id: "tst-0002", name_ja: "充電式電池" })],
    [
      item({
        id: "tst-0002",
        name_ja: "充電式電池",
        dispositions: [{ category_id: "fuka", note_ja: null, official_link: null }],
      }),
    ]
  )
  it("データが更新された市は PR にし、危険物の変更を先頭に出す", () => {
    const outcomes: UpdateOutcome[] = [
      { slug: "a-city", status: "updated", diff, version: "20261005" },
      { slug: "b-city", status: "unchanged" },
    ]
    const r = renderReport(outcomes, WATCH, "2026-10-05")
    expect(r.hasChanges).toBe(true)
    expect(r.needsAttention).toBe(false)
    expect(r.title).toBe("data: a-city のデータ更新(自動)")
    expect(r.body).toContain("必ず確認してください")
    expect(r.body).toContain("- 変更: 充電式電池 — 区分: sodai → fuka")
    expect(r.body).toContain("- 変更なし: b-city")
    expect(r.attention).toBe("")
  })
  it("目印の記録だけでも PR にする(コミットしないと毎週検出し続けるため)", () => {
    const r = renderReport(
      [
        { slug: "a-city", status: "recorded" },
        { slug: "b-city", status: "refreshed" },
      ],
      WATCH,
      "2026-10-05"
    )
    expect(r.hasChanges).toBe(true)
    expect(r.title).toBe("chore: データの取得元の確認記録を更新(自動)")
  })
  it("自動で直せないもの・確認できなかったものは Issue の本文にする", () => {
    const r = renderReport(
      [
        { slug: "a-city", status: "needs-attention", reason: "新しい区分名があります" },
        { slug: "b-city", status: "check-failed", reason: "取得失敗: 403" },
        { slug: "c-city", status: "unchanged" },
      ],
      WATCH,
      "2026-10-05"
    )
    expect(r.hasChanges).toBe(false)
    expect(r.needsAttention).toBe(true)
    expect(r.attention).toContain("**a-city**(更新を検出しました): 新しい区分名があります")
    expect(r.attention).toContain("**b-city**(確認できませんでした): 取得失敗: 403")
    expect(r.attention).toContain("データ更新を進めて")
  })
  it("何も無ければ PR も Issue も作らない", () => {
    const r = renderReport([{ slug: "a-city", status: "unchanged" }], WATCH, "2026-10-05")
    expect(r.hasChanges).toBe(false)
    expect(r.needsAttention).toBe(false)
  })
})
