import { describe, expect, it } from "vitest"
import itemsFile from "../../data/municipalities/osaka-city/items.json"
import { ItemsFileSchema } from "./schemas"
import {
  SHARD_COUNT,
  itemShardUrl,
  shardOf,
  toSearchIndex,
  toShards,
} from "./public-data"

const items = ItemsFileSchema.parse(itemsFile).items

describe("shardOf", () => {
  it("連番 % SHARD_COUNT", () => {
    expect(shardOf("osk-0001")).toBe(1)
    expect(shardOf("osk-0032")).toBe(0)
    expect(shardOf("abc-1056")).toBe(1056 % SHARD_COUNT)
  })
  it("形式が不正ならエラー", () => {
    expect(() => shardOf("osk-1")).toThrow()
  })
})

describe("toShards", () => {
  it("全品目がちょうど1回ずつ、正しいシャードに入る", () => {
    const shards = toShards(items)
    expect(shards).toHaveLength(SHARD_COUNT)
    const total = shards.reduce((n, s) => n + Object.keys(s).length, 0)
    expect(total).toBe(items.length)
    for (const item of items)
      expect(shards[shardOf(item.id)][item.id]).toEqual(item)
  })
})

describe("toSearchIndex / URL", () => {
  it("区分IDは重複除去される", () => {
    const idx = toSearchIndex(items)
    for (const e of idx) expect(new Set(e.c).size).toBe(e.c.length)
  })
  it("シャードURLにバージョンが付く", () => {
    expect(itemShardUrl("osaka-city", "osk-0033", "20260706")).toBe(
      "/data/osaka-city/items/01.json?v=20260706"
    )
  })
})
