import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { CACHE_DIR } from "../../core/paths"
import { cleanLabel, cleanName, cleanNote } from "./convert"
import { ubeCityAdapter } from "./index"

describe("cleanName(宇部市の品目名)", () => {
  it("一覧にある読み仮名の断片だけを取る", () => {
    expect(cleanName("洗濯機センタクキ")).toBe("洗濯機")
    expect(cleanName("コロナ検査キットケンサ")).toBe("コロナ検査キット")
    expect(cleanName("テーブル（長辺１．５ｍ未満）ナガヘンミマン")).toBe(
      "テーブル（長辺１．５ｍ未満）"
    )
  })
  it("本物のカタカナの名前は削らない", () => {
    for (const name of ["電気カミソリ", "延長コード", "安全ピン", "ICレコーダー"])
      expect(cleanName(name)).toBe(name)
  })
})

describe("cleanLabel(宇部市の区分名)", () => {
  it("【】の中だけにし、後ろの読み仮名の断片も取る", () => {
    expect(cleanLabel("【燃やせないごみ】")).toBe("燃やせないごみ")
    expect(cleanLabel("【小型家電品目】コガタカデンヒンモク")).toBe("小型家電品目")
    expect(cleanLabel("【粗大ごみ】ソダイ")).toBe("粗大ごみ")
  })
  it("知らない文字が後ろにあれば止める", () => {
    expect(() => cleanLabel("【粗大ごみ】ほか")).toThrow(/知らない文字/)
  })
})

describe("cleanNote(宇部市の出し方)", () => {
  it("画面の飾りと、一覧にある末尾の読み仮名の断片を取る。ほかの文字は変えない", () => {
    expect(
      cleanNote(
        "♻\n🚮注意事項\n使用済・未使用ともに二重袋で出すシヨウズミシヨウニジュウブクロダ",
        "コロナ検査キット"
      )
    ).toBe("使用済・未使用ともに二重袋で出す")
    expect(cleanNote("♻\n🚮注意事項\n長さ1m・幅50cm以下のもの", "アイロン")).toBe(
      "長さ1m・幅50cm以下のもの"
    )
  })
})

describe("宇部市のアダプタ(取得済みの Excel から作った CSV で)", () => {
  const items = ubeCityAdapter.parse(
    readFileSync(join(CACHE_DIR, "ube-city.csv"), "utf-8")
  )
  const find = (name: string) => items.find((i) => i.name_ja === name)

  it("品目ではない行を除いて1,127品目を読み、区分はすべて区分IDに当たる", () => {
    expect(items).toHaveLength(1127)
    for (const item of items)
      for (const row of item.rows)
        expect(ubeCityAdapter.resolveCategoryId(row.category_label)).not.toBeNull()
    for (const name of ["彼女", "明日", "燃やせるごみの日", "ポリプロピレン・ポリエチレン"])
      expect(find(name)).toBeUndefined()
  })

  it("電池が取り外せない製品は、回収ボックスの注記を先頭に置き、市の原文も残す(Kaz の判断 2026-10-20)", () => {
    for (const name of ["スマートフォン", "コードレス掃除機", "ワイヤレスマウス"]) {
      const note = find(name)?.rows[0].note ?? ""
      expect(note.startsWith("※もったいナビ注: 市の充電式電池のページ(2025-07-16)")).toBe(true)
      expect(note).toContain("また月一回の燃やせないごみに出すこともできます。")
    }
  })

  it("出し方に画面の飾りが残らない", () => {
    for (const item of items)
      for (const row of item.rows) expect(row.note ?? "").not.toMatch(/[♻🚮]/u)
  })

  it("市での処理不可は「市では収集しません。」で始まる", () => {
    expect(find("灯油")?.rows[0].note?.startsWith("市では収集しません。")).toBe(true)
  })
})
