/**
 * 市区町村の地図(screens.md §9)の変換。境界データ(TopoJSON)を、県ごとの SVG のパスにする。
 * 元データ: 国土数値情報(行政区域データ、国土交通省、CC BY 4.0)を軽くした公開データ
 * (smartnews-smri/japan-topography。政令指定都市の区をまとめた全国版、簡素化 1%)。
 * 地図のライブラリは使わない(TopoJSON の展開と投影は、ここの小さな関数で足りる)。
 */

export type Point = [x: number, y: number]
export type Ring = Point[]

export interface Topology {
  arcs: number[][][]
  transform?: { scale: [number, number]; translate: [number, number] }
  objects: Record<string, { geometries: TopoGeometry[] }>
}

export interface TopoGeometry {
  type: "Polygon" | "MultiPolygon"
  arcs: number[][] | number[][][]
  properties: Record<string, string | null>
}

/** 差分で持っている弧の座標を、経度・緯度に戻す */
export function decodeArcs(topo: Topology): Ring[] {
  const [sx, sy] = topo.transform?.scale ?? [1, 1]
  const [tx, ty] = topo.transform?.translate ?? [0, 0]
  return topo.arcs.map((arc) => {
    let x = 0
    let y = 0
    return arc.map(([dx, dy]): Point => {
      x += dx
      y += dy
      return topo.transform ? [x * sx + tx, y * sy + ty] : [dx, dy]
    })
  })
}

/** 弧の番号の並び → 1本の輪(負の番号 ~i は逆向き。つなぎ目の重なる点は1つにする) */
function stitch(indexes: number[], arcs: Ring[]): Ring {
  const ring: Ring = []
  for (const i of indexes) {
    const arc = i >= 0 ? arcs[i] : [...arcs[~i]].reverse()
    for (let k = ring.length > 0 ? 1 : 0; k < arc.length; k++) ring.push(arc[k])
  }
  return ring
}

/** 図形 → 外周の輪の一覧(穴は地図の押しやすさに関係しないので捨てる) */
export function outerRings(geometry: TopoGeometry, arcs: Ring[]): Ring[] {
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.arcs as number[][]]
      : (geometry.arcs as number[][][])
  return polygons.map((polygon) => stitch(polygon[0], arcs))
}

/** 輪の面積(符号なし) */
export function ringArea(ring: Ring): number {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

/** 輪の重心(面積がほぼ 0 のときは点の平均) */
export function ringCentroid(ring: Ring): Point {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    const f = x1 * y2 - x2 * y1
    a += f
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  if (Math.abs(a) < 1e-12) {
    const n = ring.length || 1
    return [
      ring.reduce((s, p) => s + p[0], 0) / n,
      ring.reduce((s, p) => s + p[1], 0) / n,
    ]
  }
  return [cx / (3 * a), cy / (3 * a)]
}

/** 経度・緯度の窓(西・南・東・北) */
export type LonLatBox = [
  west: number,
  south: number,
  east: number,
  north: number,
]

export function boxOf(rings: Ring[]): LonLatBox {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const ring of rings)
    for (const [x, y] of ring) {
      if (x < w) w = x
      if (x > e) e = x
      if (y < s) s = y
      if (y > n) n = y
    }
  return [w, s, e, n]
}

function insideBox([x, y]: Point, [w, s, e, n]: LonLatBox): boolean {
  return x >= w && x <= e && y >= s && y <= n
}

/**
 * 整数に丸めた点の輪 → SVG のパス(最初の点は絶対、以降は差分)。
 * 丸めて同じ場所になった点は捨てる。3点に満たなければ空文字。
 */
export function ringToPath(ring: Ring): string {
  const pts: Point[] = []
  for (const [x, y] of ring) {
    const p: Point = [Math.round(x), Math.round(y)]
    const last = pts[pts.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p)
  }
  if (pts.length > 1) {
    const first = pts[0]
    const last = pts[pts.length - 1]
    if (first[0] === last[0] && first[1] === last[1]) pts.pop()
  }
  if (pts.length < 3) return ""
  let d = `M${pts[0][0]},${pts[0][1]}l`
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0]
    const dy = pts[i][1] - pts[i - 1][1]
    d += `${i > 1 && dx >= 0 ? " " : ""}${dx}${dy >= 0 ? "," : ""}${dy}`
  }
  return `${d}z`
}

/** 配信する県の地図(public/data/map/pref-NN.json) */
export interface PrefMap {
  /** viewBox の幅と高さ */
  w: number
  h: number
  /** 地図に描く市区町村(d: パス、c: 名前を置く場所) */
  m: { s: string; d: string; c: [number, number] }[]
  /** 地図の枠の外にある市区町村(離島など)。地図の下に名前で並べる */
  off: string[]
}

export interface PrefMapInput {
  /** 都道府県コード(2桁) */
  code: string
  /** その県の市区町村(slug と、経度・緯度の外周の輪) */
  municipalities: { slug: string; rings: Ring[] }[]
  /** 地図に描く範囲。無ければ県の全体 */
  window?: LonLatBox
}

export const MAP_WIDTH = 1000
/** 地図のまわりの余白(枠にくっつかないように) */
const MAP_PADDING = 24
/** これより小さい島・飛び地は描かない(viewBox の単位の面積。その市区町村で最大の輪は残す) */
const MIN_RING_AREA = 12

/**
 * 県の市区町村を、幅 1000 の viewBox に収まるパスにする。
 * 投影は正距円筒図法を県の中央の緯度で補正したもの(県の広さなら形のゆがみは小さい)。
 */
export function buildPrefMap(input: PrefMapInput): PrefMap {
  const all = input.municipalities.flatMap((m) => m.rings)
  const win = input.window ?? boxOf(all)
  const [west, south, east, north] = win
  const k = Math.cos((((south + north) / 2) * Math.PI) / 180)
  const scale = (MAP_WIDTH - MAP_PADDING * 2) / ((east - west) * k)
  const project = ([lon, lat]: Point): Point => [
    MAP_PADDING + (lon - west) * k * scale,
    MAP_PADDING + (north - lat) * scale,
  ]
  const out: PrefMap = {
    w: MAP_WIDTH,
    h: Math.ceil((north - south) * scale) + MAP_PADDING * 2,
    m: [],
    off: [],
  }
  for (const muni of input.municipalities) {
    const visible = muni.rings
      .filter((ring) => insideBox(ringCentroid(ring), win))
      .map((ring) => ring.map(project))
      .map((ring) => ({ ring, area: ringArea(ring) }))
      .sort((a, b) => b.area - a.area)
    if (visible.length === 0) {
      out.off.push(muni.slug)
      continue
    }
    const d = visible
      .filter((r, i) => i === 0 || r.area >= MIN_RING_AREA)
      .map((r) => ringToPath(r.ring))
      .join("")
    if (!d) {
      // 丸めると点になるほど小さい市区町村は、名前で並べる側に回す
      out.off.push(muni.slug)
      continue
    }
    const [cx, cy] = ringCentroid(visible[0].ring)
    out.m.push({ s: muni.slug, d, c: [Math.round(cx), Math.round(cy)] })
  }
  return out
}

/**
 * 離島が遠くて、全体を入れると本土が小さくなりすぎる県の、地図に描く範囲。
 * 枠の外の市区町村は、地図の下に名前で並ぶ(選べなくはならない)。
 */
export const PREF_WINDOWS: Record<string, LonLatBox> = {
  // 東京都: 伊豆諸島・小笠原を外す
  "13": [138.9, 35.48, 139.95, 35.92],
  // 鹿児島県: 種子島・屋久島・トカラ・奄美を外す(甑島は入れる)
  "46": [129.6, 30.95, 131.25, 32.35],
  // 沖縄県: 本島と周辺(久米島・伊平屋まで)。宮古・八重山・大東を外す
  "47": [126.6, 26.0, 128.4, 27.15],
}

export interface RegistryRow {
  slug: string
  lg_code: string
}

/**
 * 全国の境界データ → 県ごとの地図。
 * レジストリにあるのに境界データに無い自治体があれば止める(選べない自治体を作らない)。
 * 境界データにだけあるもの(北方領土の6村、所属未定地)は捨てる。
 */
export function buildAllPrefMaps(
  topo: Topology,
  registry: RegistryRow[]
): { maps: Map<string, PrefMap>; skipped: string[] } {
  const arcs = decodeArcs(topo)
  const slugByCode = new Map(
    registry.map((r) => [r.lg_code.slice(0, 5), r.slug])
  )
  const byPref = new Map<string, { slug: string; rings: Ring[] }[]>()
  const seen = new Set<string>()
  const skipped: string[] = []
  for (const object of Object.values(topo.objects)) {
    for (const g of object.geometries) {
      const code = g.properties.N03_007
      const slug = code ? slugByCode.get(code) : undefined
      if (!code || !slug) {
        skipped.push(
          `${code ?? "コードなし"} ${g.properties.N03_001 ?? ""}${g.properties.N03_004 ?? g.properties.N03_003 ?? ""}`
        )
        continue
      }
      seen.add(code)
      const pref = code.slice(0, 2)
      const list = byPref.get(pref) ?? []
      const rings = outerRings(g, arcs)
      const same = list.find((m) => m.slug === slug)
      if (same) same.rings.push(...rings)
      else list.push({ slug, rings })
      byPref.set(pref, list)
    }
  }
  const missing = registry.filter((r) => !seen.has(r.lg_code.slice(0, 5)))
  if (missing.length > 0)
    throw new Error(
      `境界データに無い自治体があります(地図から選べなくなる): ${missing
        .map((r) => `${r.lg_code} ${r.slug}`)
        .join(", ")}`
    )
  const maps = new Map<string, PrefMap>()
  for (const [code, municipalities] of [...byPref].sort()) {
    maps.set(
      code,
      buildPrefMap({ code, municipalities, window: PREF_WINDOWS[code] })
    )
  }
  return { maps, skipped }
}
