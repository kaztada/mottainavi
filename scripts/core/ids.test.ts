import { describe, expect, it } from "vitest"
import { assignIds, emptyIdMap, formatItemId } from "./ids"

const base = assignIds(["アイロン", "傘", "ソファー"], emptyIdMap("osk"))

describe("assignIds", () => {
  it("新規自治体では出現順に連番を振る", () => {
    expect(base.ids).toEqual(["osk-0001", "osk-0002", "osk-0003"])
    expect(base.idMap.next_seq).toBe(4)
  })

  it("途中に品目が1件増えても既存品目のIDは変わらない", () => {
    const r = assignIds(["アイロン", "インク", "傘", "ソファー"], base.idMap)
    expect(r.ids).toEqual(["osk-0001", "osk-0004", "osk-0002", "osk-0003"])
    expect(r.added).toEqual(["インク"])
  })

  it("品目が1件消えても他のIDは変わらず、消えた品目のエントリは残る", () => {
    const r = assignIds(["アイロン", "ソファー"], base.idMap)
    expect(r.ids).toEqual(["osk-0001", "osk-0003"])
    expect(r.idMap.map["傘"]).toBe("osk-0002")
    expect(r.idMap.next_seq).toBe(4)
  })

  it("消えた品目が再登場したら元のIDに戻る(IDは再利用されない)", () => {
    const removed = assignIds(["アイロン", "ソファー"], base.idMap)
    const back = assignIds(["アイロン", "傘", "ソファー", "机"], removed.idMap)
    expect(back.ids).toEqual(["osk-0001", "osk-0002", "osk-0003", "osk-0004"])
  })

  it("入力の idMap を書き換えない", () => {
    const before = JSON.stringify(base.idMap)
    assignIds(["新品目"], base.idMap)
    expect(JSON.stringify(base.idMap)).toBe(before)
  })

  it("同名品目が2件あればエラー(IDを一意に振れない)", () => {
    expect(() => assignIds(["傘", "傘"], base.idMap)).toThrow()
  })
})

describe("formatItemId", () => {
  it("4桁ゼロ埋め", () => {
    expect(formatItemId("osk", 7)).toBe("osk-0007")
  })
  it("9999 を超えたらエラー", () => {
    expect(() => formatItemId("osk", 10000)).toThrow()
  })
})
