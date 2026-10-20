import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { normalizeLabel } from "../../core/standard-csv"
import { PAGE_REF_NOTE, splitNameCell, toStandardCsv, withPageRefNote } from "./convert"
import { niigataCityAdapter, niigataCityConfig } from "./index"

const HEAD =
  '﻿五十音,"品目名\n（黄色塗りつぶしは\n「ごみ分別百科事典」に掲載）",分別区分\r\n'
const known = new Set(Object.keys(niigataCityConfig.labelToId))

describe("toStandardCsv(新潟市: 品目名のセルを品目名と注意書きに分ける)", () => {
  it("1行目を品目名、2行目以降を注意書きにする", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          'あ,"雨とい（プラスチック製）\n金属製は「燃やさないごみ」\n指定袋に入らない場合は「粗大ごみ」",燃やすごみ\r\n' +
          ",アイロン,燃やさないごみ\r\n" +
          ",マーガリンの外箱（紙製）,古紙類(雑誌・雑がみ)\r\n",
        known
      )
    )
    expect(rows[1].slice(2)).toEqual([
      "雨とい（プラスチック製）",
      "燃やすごみ",
      "金属製は「燃やさないごみ」\n指定袋に入らない場合は「粗大ごみ」",
    ])
    expect(rows[2].slice(2)).toEqual(["アイロン", "燃やさないごみ", ""])
    // 区分名の半角かっこは normalizeLabel で全角と同じ区分になる
    expect(niigataCityConfig.labelToId[normalizeLabel(rows[3][3])]).toBe("zasshi")
  })

  it("品目名の誤字は直し、注意書きは原文のまま(ページ参照には説明の1行を足す)", () => {
    expect(splitNameCell("キッチンペーバー")[0]).toBe("キッチンペーパー")
    expect(splitNameCell("マニュキュアのびん\n中身は使い切ってください")).toEqual([
      "マニキュアのびん",
      "中身は使い切ってください",
    ])
    expect(withPageRefNote("「家電リサイクル法対象品製品」Ｐ.２５参照")).toBe(
      "「家電リサイクル法対象品製品」Ｐ.２５参照\n" + PAGE_REF_NOTE
    )
    expect(withPageRefNote("新聞紙と一緒に出してください")).toBe("新聞紙と一緒に出してください")
  })

  it("想定していない区分・見出し・列数なら止める", () => {
    expect(() => toStandardCsv(HEAD + ",アイロン,有害ごみ\r\n", known)).toThrow(
      /想定していない分別区分/
    )
    expect(() =>
      toStandardCsv(HEAD.replace("分別区分", "区分"), known)
    ).toThrow(/見出し/)
    expect(() =>
      toStandardCsv(HEAD + ",アイロン,燃やさないごみ,余分\r\n", known)
    ).toThrow(/列数/)
  })
})

describe("新潟市のアダプタ(取得済みの CSV で)", () => {
  const items = niigataCityAdapter.parse(
    readFileSync(join(CACHE_DIR, "niigata-city.csv"), "utf-8")
  )
  const find = (name: string) => items.find((i) => i.name_ja === name)

  it("973品目を読み、区分はすべて解決できる", () => {
    expect(items).toHaveLength(973)
    for (const item of items) {
      for (const row of item.rows) {
        expect(niigataCityAdapter.resolveCategoryId(row.category_label)).not.toBeNull()
      }
    }
  })

  it("冊子のページ参照がある19件に、説明の1行が付く", () => {
    const notes = items.flatMap((i) => i.rows.map((r) => r.note ?? ""))
    expect(notes.filter((n) => n.includes(PAGE_REF_NOTE)).length).toBe(19)
  })

  it("排出禁止物は「市では収集しません。」で始まり、市の注意書きを残す", () => {
    const note = find("テレビ")?.rows[0].note ?? ""
    expect(note.startsWith("市では収集しません。")).toBe(true)
    expect(note).toContain("「家電リサイクル法対象製品」Ｐ.２５参照")
  })

  it("特定5品目の区分の説明に、窓口での対面受取と「中身入り」の表示がある", () => {
    const note = find("モバイルバッテリー")?.rows[0].note ?? ""
    expect(note).toContain("廃棄物対策課")
    expect(note).toContain("中身入り")
  })
})
