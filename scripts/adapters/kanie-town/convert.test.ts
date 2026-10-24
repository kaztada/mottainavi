import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { EMPTY_LABEL_FIXES, toStandardCsv } from "./convert"
import { kanieTownAdapter } from "./index"

const HEAD = "50音順,品名,分別,注意点\r\n"

describe("toStandardCsv(蟹江町)", () => {
  it("市町コードと連番を足し、4列を標準形式の5列にする", () => {
    const names = Object.keys(EMPTY_LABEL_FIXES)
    const text =
      HEAD +
      "あ,アイロン,使用済小型家電または不燃,\r\n" +
      names.map((n) => `x,${n},,注意\r\n`).join("") +
      "な,長靴（ゴム製）,不燃,\r\n"
    const rows = parseCsv(toStandardCsv(text))
    expect(rows[0]).toEqual(["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"])
    expect(rows[1]).toEqual(["234257", "1", "アイロン", "使用済小型家電または不燃", ""])
    expect(rows[2][1]).toBe("2")
  })
  it("区分が空の行は指定どおりに読み替える(ルーフキャリアだけ粗大ごみ)", () => {
    const names = Object.keys(EMPTY_LABEL_FIXES)
    const text =
      HEAD + names.map((n) => `x,${n},,注意\r\n`).join("") + "な,長靴（ゴム製）,不燃,\r\n"
    const rows = parseCsv(toStandardCsv(text))
    const byName = new Map(rows.slice(1).map((r) => [r[2], r[3]]))
    expect(byName.get("ルーフキャリア（車用）")).toBe("粗大ごみ")
    expect(byName.get("消火器")).toBe("収集できません")
    expect(byName.get("長靴（ゴム製）")).toBe("不燃") // 区分が入っている行は変えない(注記は index.ts)
  })
  it("読み替えの指定が無い空の区分の行があれば止める", () => {
    expect(() => toStandardCsv(HEAD + "あ,新しい品目,,注意\r\n")).toThrow(/読み替えの指定/)
  })
  it("指定した品目が見つからなければ止める", () => {
    expect(() => toStandardCsv(HEAD + "あ,アイロン,不燃,\r\n")).toThrow(/読み替えの指定|見つかりません/)
  })
  it("見出しが違えば止める", () => {
    expect(() => toStandardCsv("a,b,c,d\r\n")).toThrow(/見出し/)
  })
})

describe("蟹江町の実データ", () => {
  const csv = readFileSync(join(CACHE_DIR, "kanie-town.csv"), "utf-8")
  const items = kanieTownAdapter.parse(csv)
  const find = (name: string) => items.find((i) => i.name_ja === name)
  it("399品目、区分が空の行は全部読み替わる", () => {
    expect(items).toHaveLength(399)
    expect(items.every((i) => i.rows.every((r) => r.category_label))).toBe(true)
  })
  it("「小型家電または不燃」は2枚のカードに分かれる", () => {
    expect(find("アイロン")?.rows.map((r) => r.category_label)).toEqual(["使用済小型家電", "不燃"])
  })
  it("消火器は収集しない", () => {
    expect(find("消火器")?.rows[0].note).toContain("市では収集しません。")
  })
  it("電池が外せない製品の注記と、充電式電池の現行の案内が付く", () => {
    expect(find("電子タバコ")?.rows[0].note).toContain("不燃ごみには出さず")
    expect(find("モバイルバッテリー")?.rows[0].note).toContain("令和8年7月")
    expect(find("モバイルバッテリー")?.rows[0].note).toContain("役場かエコステーションへ")
  })
})
