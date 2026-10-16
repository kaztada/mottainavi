import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { normalizeLabel } from "../../core/standard-csv"
import { EXPECTED_HEADER, toStandardCsv } from "./convert"
import { setagayaKuAdapter, setagayaKuConfig } from "./index"

const HEAD = "﻿" + EXPECTED_HEADER.join(",") + "\r\n"
const known = new Set(Object.keys(setagayaKuConfig.labelToId))

describe("toStandardCsv(世田谷区: 入れ替わった列を戻す)", () => {
  it("品目と分別区分を入れ替え、備考を注意点にする", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          "131121,131121S00001,不燃ごみ,アイスピック,,無料,,,新聞紙等に包んで「キケン」と表示してください\r\n" +
          "131121,131121S00002,不燃ごみもしくは区では回収できないもの,防犯用ジャリ,,無料,,,廃ガラス製は「不燃」\r\n",
        known
      )
    )
    expect(rows[1]).toEqual([
      "131121",
      "131121S00001",
      "アイスピック",
      "不燃ごみ",
      "新聞紙等に包んで「キケン」と表示してください",
    ])
    // 「もしくは」は「または」にそろえる(1セル2区分としてカードを分けるため)
    expect(rows[2][3]).toBe("不燃ごみまたは区では回収できないもの")
  })

  it("区が列を直した(品目の列に品目名が入った)ら止める", () => {
    expect(() =>
      toStandardCsv(
        HEAD + "131121,131121S00001,アイスピック,不燃ごみ,,無料,,,\r\n",
        known
      )
    ).toThrow(/入れ替わっている前提/)
  })

  it("見出しが変わったら止める", () => {
    expect(() =>
      toStandardCsv(HEAD.replace("_備考", "_その他"), known)
    ).toThrow(/見出し/)
  })

  it("区の区分の表記はすべて区分に当たる", () => {
    for (const label of known) expect(label).toBe(normalizeLabel(label))
  })
})

describe("世田谷区のアダプタ(取得済みの CSV で)", () => {
  const items = setagayaKuAdapter.parse(
    readFileSync(join(CACHE_DIR, "setagaya-ku.csv"), "utf-8")
  )
  const find = (name: string) => items.find((i) => i.name_ja === name)

  it("787品目を読み、区分が入れ替わっていない", () => {
    expect(items).toHaveLength(787)
    expect(find("アイスピック")?.rows[0].category_label).toBe("不燃ごみ")
  })

  it("収集しない区分は「区では収集しません。」にする", () => {
    const note = find("テレビ")?.rows[0].note ?? ""
    expect(note.startsWith("区では収集しません。")).toBe(true)
    expect(
      items.some((i) =>
        i.rows.some((r) => r.note?.includes("市では収集しません"))
      )
    ).toBe(false)
  })

  it("2区分の品目はカードを分ける", () => {
    expect(find("防犯用ジャリ")?.rows.map((r) => r.category_label)).toEqual([
      "不燃ごみ",
      "区では回収できないもの",
    ])
  })
})
