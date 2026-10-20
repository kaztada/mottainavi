import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { normalizeLabel } from "../../core/standard-csv"
import {
  EXPECTED_HEADER,
  LABEL_SHORI,
  LABEL_SOUDAN,
  labelForEmpty,
  toStandardCsv,
} from "./convert"
import { hachiojiCityAdapter, hachiojiCityConfig } from "./index"

const HEAD = [...EXPECTED_HEADER, "", "", "", "", "", ""].join(",") + "\r\n"
const known = new Set(Object.keys(hachiojiCityConfig.labelToId))
const row = (cells: string[]) =>
  [...cells, "", "", "", "", "", ""].map((c) => `"${c}"`).join(",") + "\r\n"

describe("toStandardCsv(八王子市: 地方公共団体名の列を外し、空の区分を埋める)", () => {
  it("地方公共団体名を外し、品目名の改行を取る", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          row([
            "132012",
            "132012S00053",
            "八王子市",
            "印鑑\n（象牙製・木製・プラスチック製）",
            "可燃ごみ",
            "",
            "有料",
            "",
            "有料の指定収集袋に入れて出す。",
            "",
          ]),
        known
      )
    )
    expect(rows[0]).toEqual([
      "全国地方公共団体コード",
      "ID",
      "品目",
      "分別区分",
      "注意点",
      "料金種別",
      "料金",
      "料金備考",
      "備考",
    ])
    expect(rows[1][2]).toBe("印鑑（象牙製・木製・プラスチック製）")
    expect(rows[1][3]).toBe("可燃ごみ")
    expect(rows[1][7]).toBe("有料の指定収集袋に入れて出す。")
  })

  it("区分が空の行は備考の文言で2つに分ける", () => {
    expect(
      labelForEmpty("専門業者が不明な場合は、ごみ総合相談センターへお問い合わせください。")
    ).toBe(LABEL_SHORI)
    expect(labelForEmpty("消火器リサイクル推進センター（03-5829-6773）へ")).toBe(LABEL_SHORI)
    expect(
      labelForEmpty(
        "収集はごみ総合相談センター、持ち込みは戸吹クリーンセンターへお問い合わせください。"
      )
    ).toBe(LABEL_SOUDAN)
    expect(labelForEmpty("戸吹クリーンセンターへお問い合わせください。")).toBe(LABEL_SOUDAN)
    expect(labelForEmpty("")).toBeNull()
  })

  it("区分が空で備考からも決められない行・知らない区分・見出しの違いは止める", () => {
    expect(() =>
      toStandardCsv(
        HEAD + row(["132012", "x", "八王子市", "なにか", "", "", "", "", "", "不明"]),
        known
      )
    ).toThrow(/備考の文言からも区分を決められません/)
    expect(() =>
      toStandardCsv(
        HEAD + row(["132012", "x", "八王子市", "なにか", "金属類", "", "", "", "", ""]),
        known
      )
    ).toThrow(/想定していない分別区分/)
    expect(() => toStandardCsv(HEAD.replace("ゴミの品目", "品目"), known)).toThrow(
      /見出し/
    )
  })

  it("区分の表記はすべて正規化済み", () => {
    for (const label of known) expect(label).toBe(normalizeLabel(label))
  })
})

describe("八王子市のアダプタ(取得済みの CSV で)", () => {
  const items = hachiojiCityAdapter.parse(
    readFileSync(join(CACHE_DIR, "hachioji-city.csv"), "utf-8")
  )
  const find = (name: string) => items.find((i) => i.name_ja === name)
  const countLabel = (label: string) =>
    items.filter((i) => i.rows.some((r) => r.category_label === label)).length

  it("1,133品目を読み、空だった区分は29行と20行に分かれる", () => {
    expect(items).toHaveLength(1133)
    expect(countLabel(LABEL_SHORI)).toBe(29)
    expect(countLabel(LABEL_SOUDAN)).toBe(20)
    for (const item of items) {
      for (const r of item.rows) {
        expect(hachiojiCityAdapter.resolveCategoryId(r.category_label)).not.toBeNull()
      }
    }
  })

  it("市で処理できないものは「市では収集しません。」で始まり、市の備考を残す", () => {
    const note = find("ピアノ")?.rows[0].note ?? ""
    expect(note.startsWith("市では収集しません。")).toBe(true)
    expect(note).toContain("専門業者が不明な場合は")
  })

  it("料金備考・備考の列を注意文言に残し、粗大ごみの可燃・不燃は「出し方」に残す", () => {
    const note = find("アコーディオンカーテン")?.rows[0].note ?? ""
    expect(note).toContain("出し方: 粗大ごみ（不燃）。")
    expect(note).toContain("持ち込み：10kgにつき350円")
    expect(note).toContain("粗大ごみコールセンターで電話予約")
  })

  it("分別辞典と違う2品目に市の現行の案内を添える", () => {
    expect(find("浄水器")?.rows[0].note).toMatch(/^※もったいナビ注: .*「可燃ごみ」/)
    expect(find("うす（木製）")?.rows[0].note).toMatch(/^※もったいナビ注: .*市では処理できず/)
  })
})
