import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { toStandardCsv } from "./convert"

describe("toStandardCsv(長浜市の4列 CSV → 標準形式の列の並び)", () => {
  it("見出し行を付け、品目・区分・備考を標準形式の位置に置く", () => {
    const rows = parseCsv(
      toStandardCsv(
        "アイロン台,あいろんだい,粗大ごみ,\n乾電池,かんでんち,使用ずみ乾電池類,販売店回収も利用してください。\n"
      )
    )
    expect(rows[0]).toEqual([
      "全国地方公共団体コード",
      "ID",
      "品目",
      "分別区分",
      "注意点",
    ])
    expect(rows[1]).toEqual(["252034", "", "アイロン台", "粗大ごみ", ""])
    expect(rows[2]).toEqual([
      "252034",
      "",
      "乾電池",
      "使用ずみ乾電池類",
      "販売店回収も利用してください。",
    ])
  })

  it("改行・カンマ・引用符を含む備考をそのまま残す", () => {
    const note =
      '中身を空にして、穴をあけてください。\n"火災"の原因になります。\n\n'
    const source = `スプレー缶,すぷれーかん,スプレー缶類（燃料缶等を含む）,"${note.replace(/"/g, '""')}"\n`
    const rows = parseCsv(toStandardCsv(source))
    expect(rows).toHaveLength(2)
    expect(rows[1][3]).toBe("スプレー缶類（燃料缶等を含む）")
    expect(rows[1][4]).toBe(note)
  })

  it("先頭の BOM と空行を無視する", () => {
    const rows = parseCsv(
      toStandardCsv("\uFEFFアイロン,あいろん,不燃ごみ,\n\n")
    )
    expect(rows).toHaveLength(2)
    expect(rows[1][2]).toBe("アイロン")
  })

  it("列数が4でない行があればエラーにする(市が列を変えたときに気づけるように)", () => {
    expect(() =>
      toStandardCsv("アイロン,あいろん,不燃ごみ,,追加の列\n")
    ).toThrow(/1行目の列数/)
    expect(() => toStandardCsv("アイロン,不燃ごみ\n")).toThrow(/列数/)
  })
})
