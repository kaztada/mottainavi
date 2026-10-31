import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { EXPECTED_HEADER, addBiko, cleanName, feeNote, toStandardCsv } from "./convert"

const head = EXPECTED_HEADER.join(",")
const line = (
  name: string,
  label: string,
  fee = "",
  feeBiko = "",
  biko = "",
  chui = ""
) => `132152,X,国立市,${name},${label},${chui},無料,${fee},${feeBiko},${biko},`
const MONOOKI = line("物置", "粗大ごみ", "2000", "", "3.3m?以下で、解体した状態にあるもののみ収集可能")

describe("feeNote", () => {
  it("粗大ごみの行は処理券の金額(数字は原本のまま)", () => {
    expect(feeNote("粗大ごみ", "1000", "")).toBe("粗大ごみ処理券: 1000円")
  })
  it("計量は10kgにつき500円の意味", () => {
    expect(feeNote("粗大ごみ", "計量", "")).toBe(
      "粗大ごみ処理券: 計量(10kgにつき500円)"
    )
  })
  it("粗大ごみ以外は、備考に粗大ごみの案内があるときだけ", () => {
    expect(feeNote("小型家電製品", "500", "50cm以上のものは粗大ごみへ")).toBe(
      "粗大ごみになるときの処理券: 500円"
    )
    expect(feeNote("小型家電製品", "500", "")).toBeNull()
  })
})

describe("cleanName と addBiko", () => {
  it("「（」の前の空白を取る", () => {
    expect(cleanName(" パソコン （ディスプレイ含む） ")).toBe(
      "パソコン（ディスプレイ含む）"
    )
  })
  it("含まれる備考は長いほうだけ、別の文は両方", () => {
    expect(addBiko(["50cm以上のものは粗大ごみへ"], "50cm以上のものは粗大ごみへ。粗大料金はサイズによる。")).toEqual([
      "50cm以上のものは粗大ごみへ。粗大料金はサイズによる。",
    ])
    expect(addBiko(["厚さ8cm以上のもの"], "厚さが8cm以上のもの")).toEqual([
      "厚さ8cm以上のもの",
      "厚さが8cm以上のもの",
    ])
    expect(addBiko(["同じ文です"], "同じ文です")).toEqual(["同じ文です"])
  })
})

describe("toStandardCsv", () => {
  it("備考・料金の文・料金備考を注意点にする", () => {
    const out = parseCsv(
      toStandardCsv(
        [
          head,
          MONOOKI,
          line("浄水器", "不燃ごみ", "500", "市指定の有料ごみ処理袋で排出", "50cm以上のものは粗大ごみへ"),
        ].join("\n")
      )
    )
    expect(out[0]).toEqual(["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"])
    expect(out[1][4]).toBe("3.3㎡以下で、解体した状態にあるもののみ収集可能\n粗大ごみ処理券: 2000円")
    expect(out[2][4]).toBe(
      "50cm以上のものは粗大ごみへ\n粗大ごみになるときの処理券: 500円\n市指定の有料ごみ処理袋で排出"
    )
  })
  it("同じ品目はまとめる", () => {
    const out = parseCsv(
      toStandardCsv(
        [
          head,
          MONOOKI,
          line("バスマット", "粗大ごみ", "200", "", "50cm未満に切った場合は可燃ごみへ"),
          line("バスマット", "粗大ごみ", "200", "", "50cm未満に切った場合は可燃ごみへ。粗大料金はサイズによる。"),
        ].join("\n")
      )
    )
    expect(out).toHaveLength(3)
    expect(out[2][4]).toBe(
      "50cm未満に切った場合は可燃ごみへ。粗大料金はサイズによる。\n粗大ごみ処理券の例: 200円(大きさや方式で変わるので、申込みのときに確かめてください)"
    )
  })
  it("同じ品目で区分が違えば止まる", () => {
    expect(() =>
      toStandardCsv([head, MONOOKI, line("傘", "不燃ごみ"), line("傘", "可燃ごみ")].join("\n"))
    ).toThrow(/区分か料金/)
  })
  it("注意点の列が埋まったら止まる", () => {
    expect(() =>
      toStandardCsv([head, MONOOKI, line("傘", "不燃ごみ", "", "", "", "注意")].join("\n"))
    ).toThrow(/注意点/)
  })
  it("見出しが違えば止まる", () => {
    expect(() => toStandardCsv("品目,区分\nあ,い\n")).toThrow(/見出し/)
  })
  it("ほかの文字化けがあれば止まる", () => {
    expect(() =>
      toStandardCsv([head, MONOOKI, line("傘", "不燃ごみ", "", "", "1m?以下")].join("\n"))
    ).toThrow(/文字化け/)
  })
  it("料金の意味が言えない行があれば止まる", () => {
    expect(() =>
      toStandardCsv([head, MONOOKI, line("傘", "不燃ごみ", "500")].join("\n"))
    ).toThrow(/意味/)
  })
  it("原本: 486品目になる", () => {
    const text = readFileSync(join(CACHE_DIR, "kunitachi-city.csv"), "utf-8")
    expect(parseCsv(toStandardCsv(text)).length - 1).toBe(486)
  })
})
