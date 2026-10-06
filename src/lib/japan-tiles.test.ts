import { describe, expect, it } from "vitest"
import registry from "../../data/municipalities.json"
import { PREF_TILES, TILE_COLS, TILE_ROWS } from "./japan-tiles"

describe("PREF_TILES", () => {
  it("レジストリの47都道府県を過不足なく1回ずつ持つ", () => {
    const prefs = [...new Set(registry.map((e) => e.pref))]
    expect(prefs).toHaveLength(47)
    expect(PREF_TILES.map((t) => t.pref).sort()).toEqual([...prefs].sort())
  })
  it("タイルが重ならず、枠からはみ出さない", () => {
    const used = new Set<string>()
    for (const t of PREF_TILES) {
      expect(t.col + t.span).toBeLessThanOrEqual(TILE_COLS)
      expect(t.row + t.span).toBeLessThanOrEqual(TILE_ROWS)
      for (let c = t.col; c < t.col + t.span; c++)
        for (let r = t.row; r < t.row + t.span; r++) {
          const key = `${c},${r}`
          expect(used.has(key), `${t.pref} が ${key} で重なる`).toBe(false)
          used.add(key)
        }
    }
  })
  it("タイルの名前は都・府・県を外す(北海道はそのまま)", () => {
    const byPref = new Map(PREF_TILES.map((t) => [t.pref, t.label]))
    expect(byPref.get("北海道")).toBe("北海道")
    expect(byPref.get("東京都")).toBe("東京")
    expect(byPref.get("京都府")).toBe("京都")
    expect(byPref.get("神奈川県")).toBe("神奈川")
  })
})
