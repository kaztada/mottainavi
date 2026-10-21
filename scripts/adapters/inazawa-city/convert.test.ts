import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { CACHE_DIR } from "../../core/paths"
import { normalizeNote } from "./convert"
import { inazawaCityAdapter } from "./index"

describe("normalizeNote(稲沢市の分別注意文)", () => {
  it("Excel の内部の改行表記「_x000D_」を取り、ほかの文字は変えない", () => {
    expect(
      normalizeNote("割れたものは「不燃ごみ」です。_x000D_\n危険防止のため、紙等で包み")
    ).toBe("割れたものは「不燃ごみ」です。\n危険防止のため、紙等で包み")
  })
})

describe("稲沢市のアダプタ(取得済みの Excel から作った CSV で)", () => {
  const items = inazawaCityAdapter.parse(
    readFileSync(join(CACHE_DIR, "inazawa-city.csv"), "utf-8")
  )
  const find = (name: string) => items.find((i) => i.name_ja === name)

  it("655品目を読み、区分はすべて区分IDに当たる(家電4品目の全角・半角も)", () => {
    expect(items).toHaveLength(655)
    for (const item of items)
      for (const row of item.rows)
        expect(inazawaCityAdapter.resolveCategoryId(row.category_label)).not.toBeNull()
  })

  it("「粗大ごみまたは不燃ごみ」はカードを分け、1枚目に原文の表記を残す", () => {
    const rows = find("扇風機")?.rows ?? []
    expect(rows.map((r) => r.category_label)).toEqual(["粗大ごみ", "不燃ごみ"])
    expect(rows[0].note).toContain("出し方: 粗大ごみまたは不燃ごみ。")
  })

  it("全部のカードに 2027-02-01 のプラスチック資源のお知らせが付く(Kaz の判断 2026-10-20)", () => {
    for (const item of items)
      for (const row of item.rows)
        expect(row.note).toContain("稲沢市は2027年2月1日から")
  })

  it("不燃ごみには電池を抜く注意が付き、モバイルバッテリーには膨張時の注意が付く", () => {
    expect(find("ドライヤー")?.rows[0].note).toContain("乾電池・充電式電池を必ず抜いてから")
    expect(find("モバイルバッテリー")?.rows[0].note).toContain("膨張・変形")
  })

  it("注意文に「_x000D_」が残らない", () => {
    for (const item of items)
      for (const row of item.rows) expect(row.note ?? "").not.toContain("_x000D_")
  })
})
