/**
 * 市区町村の地図(screens.md §9)に置く、対応済みの市区町村の名前のラベル。
 * 隣り合う市の名前が重なると読めないので、短い名前にして、それでも重なるときは上下にずらす。
 */

/** 地図の上に出す短い名前。英語名は末尾の City / Town / Village / Ward を外す(日本語名はそのまま) */
export function shortMapLabel(name: string): string {
  return name.replace(/\s+(City|Town|Village|Ward)$/, "")
}

/** ラベルの幅の見積もり(全角は1文字=文字の大きさ、半角は 0.6 倍) */
export function estimateLabelWidth(text: string, fontSize: number): number {
  let width = 0
  for (const ch of text) width += /[\u0000-ÿ]/.test(ch) ? 0.6 : 1
  return width * fontSize
}

export interface MapLabel {
  key: string
  text: string
  x: number
  y: number
}

/**
 * ラベル同士が重ならないように、あとから置くラベルを下へずらす。
 * 置く順は上(北)から。x は変えない(どの市の名前か分からなくならないように、ずらすのは縦だけ)。
 */
export function placeMapLabels(
  labels: MapLabel[],
  fontSize: number
): MapLabel[] {
  const lineHeight = fontSize * 1.15
  const placed: (MapLabel & { half: number })[] = []
  for (const label of [...labels].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const half = estimateLabelWidth(label.text, fontSize) / 2
    let y = label.y
    // 重なる相手がいるあいだ、その相手のすぐ下へ動かす
    for (let guard = 0; guard < labels.length; guard++) {
      const hit = placed.find(
        (p) =>
          Math.abs(p.x - label.x) < p.half + half &&
          // ちょうど1段ぶん離れたものは重なりとみなさない(小数の誤差で同じ相手に当たり続けないように)
          Math.abs(p.y - y) < lineHeight - 0.01
      )
      if (!hit) break
      y = hit.y + lineHeight
    }
    placed.push({ ...label, y, half })
  }
  return placed.map(({ key, text, x, y }) => ({ key, text, x, y }))
}
