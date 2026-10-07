import { describe, expect, it } from "vitest"
import { estimateLabelWidth, placeMapLabels, shortMapLabel } from "./map-labels"

describe("shortMapLabel", () => {
  it("英語名の末尾の City / Town / Village / Ward を外す", () => {
    expect(shortMapLabel("Osaka City")).toBe("Osaka")
    expect(shortMapLabel("Higashiosaka City")).toBe("Higashiosaka")
    expect(shortMapLabel("Ogasawara Village")).toBe("Ogasawara")
    expect(shortMapLabel("Chiyoda Ward")).toBe("Chiyoda")
  })
  it("日本語名と、途中に City を含む名前は変えない", () => {
    expect(shortMapLabel("東大阪市")).toBe("東大阪市")
    expect(shortMapLabel("City Park Town")).toBe("City Park")
  })
})

describe("placeMapLabels", () => {
  const size = 36
  it("重ならないラベルは動かさない", () => {
    const labels = [
      { key: "a", text: "大阪市", x: 400, y: 500 },
      { key: "b", text: "河内長野市", x: 600, y: 900 },
    ]
    expect(placeMapLabels(labels, size)).toEqual(labels)
  })
  it("横に重なる隣の市(大阪市と東大阪市の英語名)は、片方を下へずらす", () => {
    const [osaka, higashi] = placeMapLabels(
      [
        { key: "osaka", text: "Osaka City", x: 530, y: 790 },
        { key: "higashi", text: "Higashiosaka City", x: 700, y: 792 },
      ],
      size
    )
    expect(osaka.y).toBe(790)
    expect(higashi.x).toBe(700)
    expect(higashi.y - osaka.y).toBeGreaterThanOrEqual(size)
  })
  it("3つが重なっても、すべて別の段に置く", () => {
    const out = placeMapLabels(
      [
        { key: "a", text: "AAAAAAAA", x: 500, y: 500 },
        { key: "b", text: "BBBBBBBB", x: 510, y: 505 },
        { key: "c", text: "CCCCCCCC", x: 520, y: 510 },
      ],
      size
    )
    const ys = out.map((l) => l.y).sort((p, q) => p - q)
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(size)
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(size)
  })
  it("幅の見積もり: 全角は文字の大きさ、半角は 0.6 倍", () => {
    expect(estimateLabelWidth("大阪市", 10)).toBe(30)
    expect(estimateLabelWidth("Osaka", 10)).toBe(30)
  })
})
