import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { toStandardCsv } from "./convert"

const HEAD =
  "全国地方公共団体コード,ID,品目,分別区分,注意点,料金種別,料金,料金備考,連絡先名称,連絡先電話番号,連絡先内線番号,連絡先メールアドレス,連絡先FormURL,連絡先備考,備考"

describe("南部町の変換(列のずれの読み替え)", () => {
  it("注意点の列の区分と、料金種別の列の注意書きを、区分・注意点に読み替える", () => {
    const csv = `${HEAD}\n313891,,アイスピック,,不燃,木製部分は可燃ごみです。,,,南部町役場町民生活課,(0859)64-3781,,,,,\n`
    const out = parseCsv(toStandardCsv(csv, {}))
    expect(out[1]).toEqual(["313891", "1", "アイスピック", "不燃", "木製部分は可燃ごみです。"])
  })
  it("注意書きが空でもよい", () => {
    const csv = `${HEAD}\n313891,,アイスノン,,可燃,,,,x,y,,,,,\n`
    expect(parseCsv(toStandardCsv(csv, {}))[1][4]).toBe("")
  })
  it("分別区分の列に値があれば止まる(町が列のずれを直した可能性)", () => {
    const csv = `${HEAD}\n313891,,アイスノン,可燃,,,,,x,y,,,,,\n`
    expect(() => toStandardCsv(csv, {})).toThrow(/分別区分/)
  })
  it("料金の列に値があれば止まる", () => {
    const csv = `${HEAD}\n313891,,アイスノン,,可燃,,100,,x,y,,,,,\n`
    expect(() => toStandardCsv(csv, {})).toThrow(/料金/)
  })
  it("重複する行をまとめる(同じ行・注意書きが空の行)", () => {
    const row = (n: string, note: string) =>
      `313891,,${n},,不燃,${note},,,x,y,,,,,\n`
    const out = parseCsv(
      toStandardCsv(HEAD + "\n" + row("A", "") + row("A", "メモ") + row("A", "メモ") + row("B", "") + row("B", ""), {})
    )
    expect(out.slice(1).map((r) => [r[2], r[4]])).toEqual([["A", "メモ"], ["B", ""]])
  })
  it("落とす行の指定に合う行が無ければ止まる", () => {
    const csv = `${HEAD}\n313891,,アイスノン,,可燃,,,,x,y,,,,,\n`
    expect(() => toStandardCsv(csv, { アイスノン: "ない注意書き" })).toThrow(/DROP_ROWS/)
  })
  it("見出しが違えば止まる", () => {
    expect(() => toStandardCsv("a,b\n1,2\n", {})).toThrow(/見出し/)
  })
})
