import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { toStandardCsv } from "./convert"
import { irumaCityAdapter } from "./index"

const HEAD =
  "識別情報,ごみの分別辞典_全国地方公共団体コード,ごみの分別辞典_団体名,ごみの分別辞典_品目,ごみの分別辞典_品目ふりがな,ごみの分別辞典_分別区分,ごみの分別辞典_注意点\r\n"

describe("toStandardCsv(入間市)", () => {
  it("標準形式の5列に並べ直し、品目名の前後の空白を取り、カッコの閉じ忘れを直す", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          "1,112259,入間市,桶（おけ)(金属製) ,おけ,不燃ごみ,\r\n" +
          "2,112259,入間市,池(園芸用（プラスチック製）,いけ,粗大ごみ（有料）,\r\n" +
          "3,112259,入間市,足拭きマット（バスマット）（脱衣場用,あしふき,粗大ごみ（有料）,\r\n" +
          "4,112259,入間市,泡立て器(調理器具（手動式・電動式）,あわだて,不燃ごみ,\r\n"
      )
    )
    expect(rows[1]).toEqual(["112259", "1", "桶（おけ)(金属製)", "不燃ごみ", ""])
    expect(rows[2][2]).toBe("池(園芸用（プラスチック製）)")
  })
  it("直す対象の行が無ければ止める", () => {
    expect(() =>
      toStandardCsv(HEAD + "1,112259,入間市,バケツ,ばけつ,不燃ごみ,\r\n")
    ).toThrow(/FIXES/)
  })
  it("見出しが違えば止める", () => {
    expect(() => toStandardCsv("a,b\r\n1,2\r\n")).toThrow(/見出し/)
  })
  it("区分の表記がすべて区分IDに解決できる", () => {
    for (const label of [
      "可燃ごみ",
      "不燃ごみ",
      "粗大ごみ（有料）",
      "有害ごみ",
      "市で処理できないもの（排出禁止物）",
      "資源ごみ（プラスチック・ビニール類）",
      "資源ごみ（古布・紙類）",
      "資源ごみ（ビン・缶・ペットボトル）",
    ]) {
      expect(irumaCityAdapter.resolveCategoryId(label), label).not.toBeNull()
    }
  })
})
