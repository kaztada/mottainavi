import { describe, expect, it } from "vitest"
import { cleanCellText, parseItemTables } from "./parse"

const BASE = "https://www.city.osaka.lg.jp/kankyo/page/0000201907.html"

/**
 * 実ページの構造を模したフィクスチャ。
 * 品目名は th scope="row"、複数区分は th の rowspan で続き行が td のみになる。
 * 一覧表以外のテーブル(関連リンク等)が混ざるケースも含む。
 */
const FIXTURE = `
<html><body>
<table summary="「あ(ア)」で始まるごみの表">
  <tbody>
  <tr>
    <th scope="col">品目(素材など)</th>
    <th scope="col">収集区分</th>
    <th scope="col">ポイント</th>
  </tr>
  <tr>
    <th scope="row">アイロン</th>
    <td><a href="/kankyo/page/0000009139.html">普通ごみ</a></td>
    <td>最大の辺または径が30cmを超えるものは粗大ごみ。</td>
  </tr>
  <tr>
    <th rowspan="2" scope="row">IHクッキングヒーター</th>
    <td><a href="/kankyo/page/0000523872.html">小型家電リサイクル回収(宅配便)</a></td>
    <td>宅配便による回収。</td>
  </tr>
  <tr>
    <td><a href="/kankyo/page/0000009182.html">粗大ごみ</a></td>
    <td>処理手数料 1台400円</td>
  </tr>
  <tr>
    <th scope="row">エアコン</th>
    <td>収集しません</td>
    <td>家電リサイクル法対象。購入店等にご相談ください。</td>
  </tr>
  <tr>
    <th scope="row">*****</th>
    <td><a href="/kankyo/page/0000369372.html">*****</a></td>
    <td>*****</td>
  </tr>
  </tbody>
</table>
<table summary="「そ(ソ)」で始まるごみの表">
  <tbody>
  <tr>
    <th scope="col">品目(素材など)</th>
    <th scope="col">収集区分</th>
    <th scope="col">ポイント</th>
  </tr>
  <tr>
    <th scope="row">ソファー</th>
    <td>粗大ごみ</td>
    <td>　</td>
  </tr>
  </tbody>
</table>
<table summary="関連リンクの表">
  <tbody>
  <tr><th scope="col">リンク</th><th scope="col">説明</th></tr>
  <tr><td>さんあ~る</td><td>公式アプリ</td></tr>
  </tbody>
</table>
</body></html>
`

describe("parseItemTables", () => {
  const items = parseItemTables(FIXTURE, BASE)

  it("複数テーブルをまたいで全品目を抽出する", () => {
    expect(items.map((i) => i.name_ja)).toEqual([
      "アイロン",
      "IHクッキングヒーター",
      "エアコン",
      "ソファー",
    ])
  })

  it("rowspanで品目名が省略された行を直前品目に集約する", () => {
    const ih = items.find((i) => i.name_ja === "IHクッキングヒーター")!
    expect(ih.rows).toHaveLength(2)
    expect(ih.rows.map((r) => r.category_label)).toEqual([
      "小型家電リサイクル回収(宅配便)",
      "粗大ごみ",
    ])
  })

  it("区分セルのリンクを絶対URLで抽出する", () => {
    const iron = items.find((i) => i.name_ja === "アイロン")!
    expect(iron.rows[0].official_link).toBe(
      "https://www.city.osaka.lg.jp/kankyo/page/0000009139.html"
    )
  })

  it("「*****」のマスク行を品目として拾わない", () => {
    expect(items.some((i) => /^\*+$/.test(i.name_ja))).toBe(false)
  })

  it("誤案内リスクの高い注意文言を欠落させない", () => {
    const aircon = items.find((i) => i.name_ja === "エアコン")!
    expect(aircon.rows[0].category_label).toBe("収集しません")
    expect(aircon.rows[0].note).toContain("家電リサイクル法対象")
  })

  it("空のポイント欄は null になる", () => {
    const sofa = items.find((i) => i.name_ja === "ソファー")!
    expect(sofa.rows[0].note).toBeNull()
  })
})

describe("cleanCellText", () => {
  it("改行・連続空白を単一スペースにする", () => {
    expect(cleanCellText("  普通\n  ごみ\t ")).toBe("普通 ごみ")
  })
})
