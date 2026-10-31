import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { normalizeName, shigenLabel, toStandardCsv } from "./convert"

const HEAD = "品目,類義語,カテゴリー,分別方法\n"
const REQUIRED =
  '愛,,市で収集しないもの,x\n思い出,,市で収集しないもの,x\n油（食用）,,燃やせるごみ,"指定ごみ袋に入れて出してください。\n■凝固剤で固めるか紙などにしみ込ませる。\n■ペットボトル等の容器に入れて、市の窓口に持ち込むこともできます。：無料"\n'

describe("恵庭市の変換", () => {
  it("品目名の空白をそろえ、※の注記は残す", () => {
    expect(normalizeName("アイロン台 ※袋に入らない")).toBe(
      "アイロン台　※袋に入らない"
    )
    expect(normalizeName("衣装ケース　　※袋に入らない　")).toBe(
      "衣装ケース　※袋に入らない"
    )
  })
  it("資源物を注意文の印で分ける", () => {
    expect(shigenLabel("電池", "「資源物（★電池）」")).toBe("資源物(電池)")
    expect(shigenLabel("体温計", "「資源物（★蛍光管）」")).toBe(
      "資源物(蛍光管・LED・水銀使用製品)"
    )
    expect(shigenLabel("温度計", "「資源物（★水銀仕様製品）」")).toBe(
      "資源物(蛍光管・LED・水銀使用製品)"
    )
    expect(shigenLabel("ダンボール", "たたんでひもで縛る（ダンボール）")).toBe(
      "資源物(ダンボール)"
    )
    expect(() => shigenLabel("なにか", "印なし")).toThrow()
  })
  it("品目でない行を除き、注意文の前後の改行だけを取る", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          REQUIRED +
          '網戸,,粗大ごみ（電話申込のみ）,"\r\n粗大ごみコールセンターへ\r\n■注意"\n'
      )
    )
    expect(rows.slice(1).map((r) => r[2])).toEqual(["網戸"])
    expect(rows[1][3]).toBe("粗大ごみ（電話申込のみ）")
    expect(rows[1][4]).toBe("粗大ごみコールセンターへ\n■注意")
  })
  it("除く行が無くなったら止まる", () => {
    expect(() => toStandardCsv(HEAD + "網戸,,粗大ごみ,x\n")).toThrow()
  })
  it("原本: 1,760行から3行を除き、注意文の文字が変わらない", () => {
    const source = readFileSync(join(CACHE_DIR, "eniwa-city.csv"), "utf-8")
    const before = parseCsv(source).slice(1)
    const after = parseCsv(toStandardCsv(source)).slice(1)
    expect(before).toHaveLength(1760)
    expect(after).toHaveLength(1757)
    const notes = new Set(before.map((r) => r[3].replace(/\r\n?/g, "\n").trim()))
    for (const r of after) expect(notes.has(r[4])).toBe(true)
  })
})
