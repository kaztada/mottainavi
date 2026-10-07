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

/**
 * 地図に出すラベルの文字。短い名前にするが、短くすると同じになる市区町村
 * (釧路市と釧路町 → どちらも Kushiro)は、区別できるよう正式な名前のままにする。
 */
export function mapLabelTexts(names: string[]): string[] {
  const shorts = names.map(shortMapLabel)
  const count = new Map<string, number>()
  for (const s of shorts) count.set(s, (count.get(s) ?? 0) + 1)
  return shorts.map((s, i) => ((count.get(s) ?? 0) > 1 ? names[i] : s))
}

export interface MapLabel {
  key: string
  text: string
  x: number
  y: number
}

/** 置いたあとのラベル。ずらしたものは、元の場所(その市区町村の中)を anchor に持つ */
export interface PlacedMapLabel extends MapLabel {
  anchor?: { x: number; y: number }
}

/**
 * ラベル同士が重ならないように、あとから置くラベルを上下にずらす。
 * 置く順は上(北)から。x は変えない。まず下へ、地図の下の端を越えるなら上へずらす。
 * ずらしたラベルは別の市区町村の上に乗ることがあるので、anchor(元の場所)を返し、
 * 画面側で引出線を引いて、どの市区町村の名前かを示す。
 */
export function placeMapLabels(
  labels: MapLabel[],
  fontSize: number,
  height = Infinity
): PlacedMapLabel[] {
  const lineHeight = fontSize * 1.15
  const placed: (PlacedMapLabel & { half: number })[] = []
  const hitAt = (x: number, y: number, half: number) =>
    placed.find(
      (p) =>
        Math.abs(p.x - x) < p.half + half &&
        // ちょうど1段ぶん離れたものは重なりとみなさない(小数の誤差で同じ相手に当たり続けないように)
        Math.abs(p.y - y) < lineHeight - 0.01
    )
  /** dir の向きへ、重ならない場所が見つかるまで動かす。枠を出たら null */
  const search = (label: MapLabel, half: number, dir: 1 | -1) => {
    let y = label.y
    for (let guard = 0; guard <= labels.length; guard++) {
      const hit = hitAt(label.x, y, half)
      if (!hit)
        return y >= fontSize / 2 && y <= height - fontSize / 2 ? y : null
      y = hit.y + dir * lineHeight
    }
    return null
  }
  for (const label of [...labels].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const half = estimateLabelWidth(label.text, fontSize) / 2
    const y = hitAt(label.x, label.y, half)
      ? (search(label, half, 1) ?? search(label, half, -1) ?? label.y)
      : label.y
    placed.push({
      ...label,
      y,
      half,
      ...(y !== label.y ? { anchor: { x: label.x, y: label.y } } : {}),
    })
  }
  return placed.map(({ key, text, x, y, anchor }) => ({
    key,
    text,
    x,
    y,
    ...(anchor ? { anchor } : {}),
  }))
}
