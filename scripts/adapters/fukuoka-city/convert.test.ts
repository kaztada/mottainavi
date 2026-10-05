import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { htmlToText, xlsxToStandardCsv } from "./convert"

const HEADER = [
  "ゴミの分別方法_全国地方公共団体コード",
  "ゴミの分別方法_ID",
  "ゴミの分別方法_品目",
  "ゴミの分別方法_分別区分",
  "ゴミの分別方法_注意点",
]

async function makeXlsx(rows: unknown[][], header = HEADER): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Sheet1")
  ws.addRow(header)
  for (const r of rows) ws.addRow(r)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

describe("htmlToText(注意点の HTML を読める文にする)", () => {
  it("リンクは「文言(URL)」にする", () => {
    expect(
      htmlToText('回収場所は<a href="https://example.jp/a.html">こちら</a>。')
    ).toBe("回収場所はこちら(https://example.jp/a.html)。")
  })

  it("<br /> は(もとの改行とあわせて)改行に、block 要素は取り除き、&nbsp; は空白に戻す", () => {
    expect(
      htmlToText("燃えるごみ<br />\n電動式は小型家電です<br />\n&nbsp;")
    ).toBe("燃えるごみ\n電動式は小型家電です")
    expect(
      htmlToText(
        '<div style="text-align: justify;">※割れたものは厚い紙で包む。</div>\n'
      )
    ).toBe("※割れたものは厚い紙で包む。")
  })

  it("文言が URL と同じなら URL だけにし、&amp; を戻す", () => {
    expect(
      htmlToText(
        '<a href="https://x.jp/?a=1&amp;b=2">https://x.jp/?a=1&amp;b=2</a>'
      )
    ).toBe("https://x.jp/?a=1&b=2")
    expect(htmlToText("A &amp; B")).toBe("A & B")
  })

  it("HTML の無い文はそのまま(改行は残す)", () => {
    expect(
      htmlToText("必ず中身を使い切ってください。\n※火気のない場所で。")
    ).toBe("必ず中身を使い切ってください。\n※火気のない場所で。")
  })
})

describe("xlsxToStandardCsv", () => {
  it("標準形式の CSV にし、注意点の HTML を掃除する(空行は飛ばす)", async () => {
    const xlsx = await makeXlsx([
      [
        401307,
        "gomi00000001",
        "ＩＣレコーダー",
        "小型家電",
        "回収ボックスへ。",
      ],
      [
        401307,
        "gomi00000339",
        "注射針",
        "",
        '回収薬局は<a href="http://x.jp/a.html">こちら</a>。<br />',
      ],
      [null, null, null, null, null],
    ])
    const rows = parseCsv(await xlsxToStandardCsv(xlsx))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual(HEADER)
    expect(rows[1]).toEqual([
      "401307",
      "gomi00000001",
      "ＩＣレコーダー",
      "小型家電",
      "回収ボックスへ。",
    ])
    expect(rows[2][3]).toBe("")
    expect(rows[2][4]).toBe("回収薬局はこちら(http://x.jp/a.html)。")
  })

  it("見出しが想定と違えばエラー(市が列を変えたときに気づけるように)", async () => {
    const xlsx = await makeXlsx([], ["品目", "区分"])
    await expect(xlsxToStandardCsv(xlsx)).rejects.toThrow(/列構成/)
  })
})
