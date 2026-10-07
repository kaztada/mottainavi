import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import registry from "../../data/municipalities.json"
import {
  buildAllPrefMaps,
  buildPrefMap,
  decodeArcs,
  polygonsOf,
  ringArea,
  ringCentroid,
  ringToPath,
  type Topology,
} from "./map"
import { CACHE_DIR } from "./paths"

const SQUARE: Topology = {
  // 2本の弧で1つの四角(0,0)-(2,0)-(2,2)-(0,2)。差分で持つ
  transform: { scale: [0.5, 0.5], translate: [130, 30] },
  arcs: [
    [
      [0, 0],
      [4, 0],
      [0, 4],
    ],
    [
      [0, 0],
      [0, 4],
      [4, 0],
    ],
  ],
  objects: {
    x: {
      geometries: [
        {
          type: "Polygon",
          arcs: [[0, -2]],
          properties: { N03_007: "99999" },
        },
      ],
    },
  },
}

describe("TopoJSON の展開", () => {
  it("差分の座標を経度・緯度に戻す", () => {
    expect(decodeArcs(SQUARE)[0]).toEqual([
      [130, 30],
      [132, 30],
      [132, 32],
    ])
  })
  it("逆向きの弧(~i)をつないで1本の輪にし、つなぎ目の点を重ねない", () => {
    const [[ring]] = polygonsOf(
      SQUARE.objects.x.geometries[0],
      decodeArcs(SQUARE)
    )
    expect(ring).toEqual([
      [130, 30],
      [132, 30],
      [132, 32],
      [130, 32],
      [130, 30],
    ])
    expect(ringArea(ring)).toBe(4)
    expect(ringCentroid(ring)).toEqual([131, 31])
  })
})

describe("ringToPath", () => {
  it("最初の点は絶対、以降は差分で書き、丸めて重なる点と閉じる点を捨てる", () => {
    expect(
      ringToPath([
        [10.2, 10.4],
        [20, 10],
        [20.3, 10.2],
        [20, 5],
        [10, 10],
      ])
    ).toBe("M10,10l10,0 0-5z")
  })
  it("丸めると面にならない輪は空文字", () => {
    expect(
      ringToPath([
        [1.1, 1.1],
        [1.2, 1.3],
        [1.4, 1.2],
      ])
    ).toBe("")
  })
})

describe("buildPrefMap", () => {
  const box = (w: number, s: number, e: number, n: number) =>
    [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
    ] as [number, number][]
  it("幅1000に収め、北を上にする", () => {
    const map = buildPrefMap({
      code: "99",
      municipalities: [
        { slug: "west", polygons: [[box(135, 34, 135.5, 35)]] },
        { slug: "east", polygons: [[box(135.5, 34, 136, 35)]] },
      ],
    })
    expect(map.w).toBe(1000)
    expect(map.m.map((m) => m.s)).toEqual(["west", "east"])
    expect(map.m[0].c[0]).toBeLessThan(map.m[1].c[0])
    expect(map.off).toEqual([])
    // 緯度1度 ≒ 経度1度 × cos(34.5°) の比で高さが決まる
    expect(map.h).toBeGreaterThan(1150)
    expect(map.h).toBeLessThan(1280)
  })
  it("穴(別の自治体の飛び地が入る場所)は外周のあとに続けて書き、ふさがない", () => {
    const map = buildPrefMap({
      code: "99",
      municipalities: [
        {
          slug: "donut",
          polygons: [[box(135, 34, 136, 35), box(135.4, 34.4, 135.6, 34.6)]],
        },
        { slug: "enclave", polygons: [[box(135.4, 34.4, 135.6, 34.6)]] },
      ],
    })
    const donut = map.m.find((m) => m.s === "donut")!
    const enclave = map.m.find((m) => m.s === "enclave")!
    expect(donut.d.match(/M/g)).toHaveLength(2)
    // 穴のパスは、飛び地のパスと同じ場所
    expect(donut.d.endsWith(enclave.d)).toBe(true)
  })
  it("枠の外の市区町村は off に入れ、枠の中の飛び地だけ描く", () => {
    const map = buildPrefMap({
      code: "99",
      window: [135, 34, 136, 35],
      municipalities: [
        {
          slug: "main",
          polygons: [[box(135, 34, 136, 35)], [box(140, 27, 140.1, 27.1)]],
        },
        { slug: "island", polygons: [[box(142, 26, 142.2, 26.2)]] },
      ],
    })
    expect(map.m.map((m) => m.s)).toEqual(["main"])
    expect(map.m[0].d.match(/M/g)).toHaveLength(1)
    expect(map.off).toEqual(["island"])
  })
})

describe("実データ(data/cache/map)", () => {
  const topo = JSON.parse(
    readFileSync(join(CACHE_DIR, "map/municipalities.topo.json"), "utf-8")
  ) as Topology
  const { maps, skipped } = buildAllPrefMaps(topo, registry)
  it("47都道府県の地図ができ、全1,741自治体が地図か枠外の一覧のどちらかに1回ずつ入る", () => {
    expect([...maps.keys()]).toEqual(
      Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, "0"))
    )
    const slugs = [...maps.values()].flatMap((m) => [
      ...m.m.map((x) => x.s),
      ...m.off,
    ])
    expect(slugs).toHaveLength(registry.length)
    expect(new Set(slugs).size).toBe(registry.length)
  })
  it("捨てるのは北方領土の6村と所属未定地だけ", () => {
    expect(skipped).toHaveLength(10)
    expect(
      skipped.filter((s) => s.startsWith("016") || s.startsWith("017"))
    ).toHaveLength(6)
    expect(skipped.filter((s) => s.includes("所属未定地"))).toHaveLength(4)
  })
  it("レジストリの県の並びは都道府県コード順(画面は並び順からコードを決める)", () => {
    const prefs = [...new Set(registry.map((e) => e.pref))]
    const codes = [...new Set(registry.map((e) => e.lg_code.slice(0, 2)))]
    expect(codes).toEqual([...codes].sort())
    expect(prefs).toHaveLength(codes.length)
  })
  it("離島の多い県は、本土を地図に、島を枠外の一覧に分ける", () => {
    const tokyo = maps.get("13")!
    expect(tokyo.off).toContain("ogasawara-village")
    expect(tokyo.m.map((m) => m.s)).toContain("hachioji-city")
    expect(maps.get("47")!.m.map((m) => m.s)).toContain("okinawa-city")
    expect(maps.get("27")!.off).toEqual([])
  })
  it("飛び地のある市(船橋市・志布志市)を囲む側は、穴をあけてある", () => {
    const holes = (code: string, slug: string) =>
      (
        maps
          .get(code)!
          .m.find((m) => m.s === slug)!
          .d.match(/M/g) ?? []
      ).length
    expect(holes("12", "kamagaya-city")).toBeGreaterThan(1)
    expect(holes("46", "osaki-town")).toBeGreaterThan(1)
  })
  it("レジストリにあって境界データに無い自治体があれば止める", () => {
    expect(() =>
      buildAllPrefMaps(topo, [
        ...registry,
        { slug: "nowhere-city", lg_code: "999999" },
      ])
    ).toThrow(/nowhere-city/)
  })
})
