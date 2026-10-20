import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { checkConfig, normalizeLabel } from "../../core/standard-csv"
import { INTERNAL_MEMOS, LABELS, glossFor, toStandardCsv } from "./convert"
import { iwakiCityAdapter, iwakiCityConfig } from "./index"

const HEAD = "﻿№,品　名,分別区分,注　意　点,,,,\r\n"
const row = (no: number, name: string, label: string, note = "") =>
  `${no},${name},${label},"${note}",,,,\r\n`

describe("toStandardCsv(いわき市の CSV → 標準形式の列)", () => {
  it("見出しを標準形式に直し、区分の略称を冊子の正式名にする", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          row(1, "アーケードゲーム機", "×", "販売店、専門業者へ") +
          row(2, "アームスタンド", "家電・金属", "蛍光灯は「燃やさないごみ」") +
          row(3, "たとう紙", "紙ーその他") +
          ",,,,,,,\r\n"
      )
    )
    expect(rows[0]).toEqual([
      "全国地方公共団体コード",
      "ID",
      "品目",
      "分別区分",
      "注意点",
    ])
    expect(rows[1]).toEqual([
      "072044",
      "1",
      "アーケードゲーム機",
      "市では収集しないもの",
      "販売店、専門業者へ",
    ])
    expect(rows[2][3]).toBe("小型家電・金属類")
    // 1件だけ長音(ー)で書かれた「紙ーその他」も同じ区分
    expect(rows[3][3]).toBe("古紙類（その他の紙）")
    // 最後の空の行は捨てる
    expect(rows).toHaveLength(4)
  })

  it("セル内の改行は残し、説明を後ろに足す(空白だけの注意点はそのまま)", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          row(1, "カメラ", "家電・金属", "電池は外して「電池」へ\n電池一体型製品は「電池」\n") +
          row(2, "アイスの袋", "容プラ", "　")
      )
    )
    expect(rows[1][4]).toBe(
      "電池は外して「電池」へ\n電池一体型製品は「電池」\n※もったいナビ注: 「電池」は電池類のこと。"
    )
    expect(rows[2][4]).toBe("　")
  })

  it("知らない区分の表記が来たら止める", () => {
    expect(() => toStandardCsv(HEAD + row(1, "なにか", "資源"))).toThrow(
      /区分の表記が想定外/
    )
  })

  it("見出しが変わったら止める", () => {
    expect(() =>
      toStandardCsv("﻿№,品　名,よみ,分別区分,注　意　点,,,\r\n")
    ).toThrow(/見出し/)
  })

  it("空の列に何か入ったら止める(列が増えた・ずれた)", () => {
    expect(() =>
      toStandardCsv(HEAD + "1,アイロン,家電・金属,,メモ,,,\r\n")
    ).toThrow(/列が想定/)
  })

  it("番号が重複したり、品目数と最後の番号が合わなかったりしたら止める", () => {
    expect(() =>
      toStandardCsv(HEAD + row(1, "a", "燃やす") + row(1, "b", "燃やす"))
    ).toThrow(/重複/)
    expect(() =>
      toStandardCsv(HEAD + row(1, "a", "燃やす") + row(3, "b", "燃やす"))
    ).toThrow(/合いません/)
  })
})

describe("glossFor(略称・窓口向けの語の説明を1行で)", () => {
  it("注意点に出てくる語だけを説明する", () => {
    expect(glossFor("プラスチック製は「製品プラ」、金属製は「家電・金属」")).toBe(
      "※もったいナビ注: 「家電・金属」は小型家電・金属類のこと。「製品プラ」「製プラ」は製品プラスチックのこと。"
    )
    expect(glossFor("「キケン」と表示")).toBeNull()
    expect(glossFor("「小型家電・金属類」へ")).toBeNull()
  })

  it("「×」「規格」「業」を説明し、かっこの無い「規格以上」や「専門業者」は説明しない", () => {
    expect(glossFor("風呂釜は×。専門業者へ")).toBe(
      "※もったいナビ注: 「×」は市では収集しないもののこと。"
    )
    expect(glossFor("規格未満の木製は燃やす")).toMatch(/「規格」は集積所に出せる大きさ/)
    expect(glossFor("規格以上のものは販売店、専門業者へ")).toBeNull()
    expect(glossFor("自宅で「業」以外に使用したもの")).toMatch(/「業」は仕事・事業/)
    expect(glossFor("事業者は産業廃棄物")).toBeNull()
  })

  it("「要聞き取り」には市への問い合わせを足す", () => {
    expect(glossFor("自宅で使用したものに限る。要聞き取り")).toBe(
      "※もったいナビ注: 「要聞き取り」とある品目は、判断に迷うときは市の資源循環推進課(0246-22-7559)にお問い合わせください。"
    )
  })
})

describe("toStandardCsv の注意点(原文を残す)", () => {
  it("原文はそのまま残し、説明は後ろに1行足す", () => {
    const rows = parseCsv(
      toStandardCsv(HEAD + row(1, "鎌", "家電・金属", "風呂釜は×。専門業者へ"))
    )
    expect(rows[1][4]).toBe(
      "風呂釜は×。専門業者へ\n※もったいナビ注: 「×」は市では収集しないもののこと。"
    )
  })

  it("内部向けのメモ2つだけを外す", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD + row(1, "劇薬", "×", "販売店、専門業者へ　※過去にヒ素の問い合わせあり")
      )
    )
    expect(rows[1][4]).toBe("販売店、専門業者へ")
  })
})

describe("いわき市のアダプタ(取得済みの CSV で)", () => {
  const raw = readFileSync(join(CACHE_DIR, "iwaki-city.csv"), "utf-8")
  const items = iwakiCityAdapter.parse(raw)
  const find = (name: string) => items.find((i) => i.name_ja === name)
  const notes = items.flatMap((i) => i.rows.map((r) => r.note ?? ""))

  it("1,662品目を読み、すべての区分の表記が区分IDに当たる", () => {
    expect(items).toHaveLength(1662)
    for (const item of items) {
      for (const r of item.rows) {
        expect(iwakiCityAdapter.resolveCategoryId(r.category_label)).not.toBeNull()
      }
    }
  })

  it("LABELS の正式名はすべて labelToId にある", () => {
    for (const label of Object.values(LABELS)) {
      expect(iwakiCityConfig.labelToId[normalizeLabel(label)]).toBeDefined()
    }
  })

  it("設定と categories.json が食い違わない", () => {
    const categories = JSON.parse(
      readFileSync(
        join(CACHE_DIR, "..", "municipalities", "iwaki-city", "categories.json"),
        "utf-8"
      )
    )
    expect(checkConfig(iwakiCityConfig, categories)).toEqual([])
  })

  it("収集しない区分は「市では収集しません。」で始まる", () => {
    expect(find("消火器")?.rows[0].note?.startsWith("市では収集しません。")).toBe(true)
  })

  it("内部向けのメモ2つは今の版にそれぞれ1回だけあり、注意文言には出ない", () => {
    for (const memo of INTERNAL_MEMOS) {
      expect(raw.split(memo).length - 1, memo).toBe(1)
      expect(notes.some((n) => n.includes(memo.trim())), memo).toBe(false)
    }
  })

  it("市の原文の注意点は、すべてそのまま注意文言に含まれる(内部向けのメモを除く)", () => {
    const src = parseCsv(raw).slice(1).filter((r) => r[1]?.trim())
    const kana = (t: string) => t.replace(/[｡-ﾟ]+/g, (m) => m.normalize("NFKC"))
    let checked = 0
    for (const r of src) {
      let original = r[3].replace(/\r\n?/g, "\n")
      for (const memo of INTERNAL_MEMOS) original = original.replace(memo, "")
      original = kana(original).replace(/\n{3,}/g, "\n\n").trim()
      if (!original) continue
      const item = find(kana(r[1].trim()))
      const joined = item?.rows.map((x) => x.note ?? "").join("\n") ?? ""
      expect(joined.includes(original), r[1]).toBe(true)
      checked++
    }
    expect(checked).toBeGreaterThan(800)
  })

  it("市の注意点が空でない品目は、注意文言も空でない(欠落させない)", () => {
    const src = parseCsv(raw).slice(1).filter((r) => r[1]?.trim())
    for (const r of src) {
      if (!r[3].trim()) continue
      const item = find(r[1].trim().replace(/[｡-ﾟ]+/g, (m) => m.normalize("NFKC")))
      expect(item?.rows[0].note, r[1]).toBeTruthy()
    }
  })

  it("大きさで区分が変わる品目と蛍光管に「60cm以上は大型ごみ」が付く", () => {
    for (const name of ["アンテナ", "本棚（木製）", "蛍光管・蛍光灯", "照明器具（蛍光灯・管）"]) {
      expect(find(name)?.rows[0].note, name).toMatch(/60cm以上.*大型ごみ/)
    }
  })

  it("カセットボンベの2品目を書き分ける", () => {
    expect(find("カセットボンベ")?.rows[0].category_label).toBe("かん類・ペットボトル")
    expect(find("カセットボンベ")?.rows[0].note).toMatch(/キャンプ用/)
    expect(
      find("ガスカートリッジ・ボンベ（カセットボンベ）")?.rows[0].category_label
    ).toBe("小型家電・金属類")
    expect(
      find("ガスカートリッジ・ボンベ（カセットボンベ）")?.rows[0].note
    ).toMatch(/卓上コンロ/)
  })

  it("モバイルバッテリーに当たる品目は電池類", () => {
    expect(
      find("バッテリー（モバイル、ビデオカメラ用等）")?.rows[0].category_label
    ).toBe("電池類")
  })
})
