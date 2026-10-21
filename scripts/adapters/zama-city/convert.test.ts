import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { CACHE_DIR } from "../../core/paths"
import { BUSINESS_NOTE, buildNote } from "./convert"
import { zamaCityAdapter } from "./index"

describe("buildNote(座間市の出し方)", () => {
  it("事業者の名前が入った出し方は、市の文を残して末尾に時点の注記を足す(Kaz の判断 2026-10-20)", () => {
    const raw =
      "収集希望の方には次の許可事業者を案内しています。(株)日環046-253-0008"
    expect(buildNote(raw)).toBe(`${raw}\n${BUSINESS_NOTE}`)
  })
  it("事業者の名前が無ければ文字を変えない(改行コードだけそろえる)", () => {
    expect(buildNote("長辺50cm以下は燃えないごみ。\r\n雨の日は出さない")).toBe(
      "長辺50cm以下は燃えないごみ。\n雨の日は出さない"
    )
    // 市の窓口(粗大ごみ等お客様ダイヤル)の番号だけなら注記は足さない
    expect(buildNote("粗大ごみ等お客様ダイヤル（046-252-7560）へ")).toBe(
      "粗大ごみ等お客様ダイヤル（046-252-7560）へ"
    )
  })
})

describe("座間市のアダプタ(取得済みの Excel から作った CSV で)", () => {
  const items = zamaCityAdapter.parse(
    readFileSync(join(CACHE_DIR, "zama-city.csv"), "utf-8")
  )
  const find = (name: string) => items.find((i) => i.name_ja === name)

  it("同じ名前の行をまとめて1,029品目を読み、区分はすべて区分IDに当たる", () => {
    expect(items).toHaveLength(1029)
    for (const item of items)
      for (const row of item.rows)
        expect(zamaCityAdapter.resolveCategoryId(row.category_label)).not.toBeNull()
  })

  it("排出禁止は「市では収集しません。」で始まり、事業者の注記は市の文の後ろに付く", () => {
    const note = find("アルミホイール（自動車）")?.rows[0].note ?? ""
    expect(note.startsWith("市では収集しません。")).toBe(true)
    expect(note.endsWith(BUSINESS_NOTE)).toBe(true)
  })

  it("モバイルバッテリーの2行はどちらも、膨らんだ電池の注記を先頭に置く", () => {
    const rows = find("モバイルバッテリー")?.rows ?? []
    expect(rows).toHaveLength(2)
    for (const row of rows)
      expect(row.note?.startsWith("※もったいナビ注: 市のリチウムイオン電池のページ")).toBe(true)
  })
})
