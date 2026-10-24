import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { EXPECTED_HEADER, toStandardCsv } from "./convert"

describe("toStandardCsv(東大和市)", () => {
  it("「地方公共団体名」の列だけを取り除く", () => {
    const rows = parseCsv(
      toStandardCsv(
        EXPECTED_HEADER.join(",") +
          "\r\n132209,132209S00001,東大和市,アイロン,不燃,注意,無料,,,備考\r\n"
      )
    )
    expect(rows[0][2]).toBe("ゴミの分別方法_品目")
    expect(rows[1]).toEqual(["132209", "132209S00001", "アイロン", "不燃", "注意", "無料", "", "", "備考"])
  })
  it("見出しが違えば止める", () => {
    expect(() => toStandardCsv("品目,分別区分\r\n")).toThrow(/見出し/)
  })
})
