import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR, municipalityFile } from "../../core/paths"
import { checkConfig } from "../../core/standard-csv"
import { fixLabel, fixName, fixNote, toStandardCsv } from "./convert"
import { hiroshimaCityAdapter, hiroshimaCityConfig } from "./index"

const HEAD = "50音,品　　　目,分別区分,排　出　方　法,備　　　考\r\n"

describe("広島市の CSV のセルの整え方", () => {
  it("品目名のセルの改行を詰め、書き間違いを直す", () => {
    expect(fixName("ウレタン\nマット（寝具）")).toBe("ウレタンマット（寝具）")
    expect(fixName("ヨーグルト\nのカップ（紙製）　　")).toBe("ヨーグルトのカップ（紙製）")
    expect(fixName("かみそりの刃\nカッターナイフの刃")).toBe("かみそりの刃・カッターナイフの刃")
    expect(fixName("アンテナ\n（テレビ用）（衛生放送用）")).toBe("アンテナ（テレビ用）（衛星放送用）")
  })

  it("区分の半角カナ・改行・「―」を直す", () => {
    expect(fixLabel("家電ﾘｻｲｸﾙ法\n対象機器")).toBe("家電リサイクル法対象機器")
    expect(fixLabel("―")).toBe("市では収集しないごみ")
    expect(fixLabel("不燃ごみ")).toBe("不燃ごみ")
  })

  it("注意点の紙面の折り返しは詰め、文の区切りの改行は残す", () => {
    expect(fixNote("30cm未満に切って、透明または半透明の\nポリ袋に入れて出す。")).toBe(
      "30cm未満に切って、透明または半透明のポリ袋に入れて出す。"
    )
    expect(
      fixNote("資源ごみとは袋を分けて、ポリ袋に\n入れて｢有害｣と書いて出す。\n（収集日は｢資源ごみ｣と同じ日）")
    ).toBe("資源ごみとは袋を分けて、ポリ袋に入れて｢有害｣と書いて出す。\n（収集日は｢資源ごみ｣と同じ日）")
    expect(fixNote("30cm未満のものは｢不燃ごみ｣\n※小型家電対象(表の上参照)")).toBe(
      "30cm未満のものは｢不燃ごみ｣\n※小型家電対象(表の上参照)"
    )
    expect(fixNote("①家電販売店に引取りを依頼する。\n②指定引取場所に自己搬入する。")).toBe(
      "①家電販売店に引取りを依頼する。\n②指定引取場所に自己搬入する。"
    )
    expect(fixNote("30cm以上のものは｢大型ごみ｣\n\n耐熱ガラスは、リサイクルができません。\n")).toBe(
      "30cm以上のものは｢大型ごみ｣\n耐熱ガラスは、リサイクルができません。"
    )
    expect(fixNote("長さが１ｍ以上のものは\n｢大型ごみ｣")).toBe("長さが１ｍ以上のものは｢大型ごみ｣")
    // 注意点の文字は直さない(原文のまま)
    expect(fixNote("透明または半透明のじゅうぶなポリ袋に入れて出す。")).toBe(
      "透明または半透明のじゅうぶなポリ袋に入れて出す。"
    )
  })
})

describe("toStandardCsv(広島市の5列 → 標準形式)", () => {
  it("排出方法と備考を両方とも注意点に残す", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          'あ,アイロン,不燃ごみ,透明または半透明のじょうぶなポリ袋に入れて出す。,※小型家電対象(表の上参照)\r\n'
      )
    )
    expect(rows[0]).toEqual(["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"])
    expect(rows[1].slice(2)).toEqual([
      "アイロン",
      "不燃ごみ",
      "透明または半透明のじょうぶなポリ袋に入れて出す。\n※小型家電対象(表の上参照)",
    ])
  })

  it("参照だけの行は、参照先の品目ごとにカードを写す", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          'か,"かばん\n(バッグ)（布製)",資源ごみ,じょうぶな袋に入れて出す。,\r\n' +
          "か,かばん（バッグ）（皮革製）,不燃ごみ,ポリ袋に入れて出す。,\r\n" +
          "か,かばん持ち手,不燃ごみ,,\r\n" +
          "は,バッグ,　　　品目「かばん」に掲載しています。,,\r\n"
      )
    )
    const bag = rows.filter((r) => r[2] === "バッグ")
    expect(bag.map((r) => r[3])).toEqual(["資源ごみ", "不燃ごみ"])
    expect(bag[0][4]).toContain("「かばん(バッグ)（布製)」の案内です")
    expect(bag[0][4]).toContain("じょうぶな袋に入れて出す。")
  })

  it("参照先が見つからなければ止める", () => {
    expect(() =>
      toStandardCsv(HEAD + "は,バッグ,品目「かばん」に掲載しています。,,\r\n")
    ).toThrow(/参照先の品目「かばん」が見つかりません/)
  })

  it("見出し・列数が違う、区分が空なら止める", () => {
    expect(() => toStandardCsv("品目,分別区分\r\n")).toThrow(/見出し/)
    expect(() => toStandardCsv(HEAD + "あ,アイロン,不燃ごみ\r\n")).toThrow(/列数/)
    expect(() => toStandardCsv(HEAD + "あ,アイロン,,,\r\n")).toThrow(/分別区分が空/)
  })
})

describe("広島市のアダプタ(取得済みの CSV で)", () => {
  const items = hiroshimaCityAdapter.parse(
    readFileSync(join(CACHE_DIR, "hiroshima-city.csv"), "utf-8")
  )
  const find = (name: string) => items.find((i) => i.name_ja === name)

  it("設定と categories.json が合っている", () => {
    const categories = JSON.parse(
      readFileSync(municipalityFile("hiroshima-city", "categories.json"), "utf-8")
    )
    expect(checkConfig(hiroshimaCityConfig, categories)).toEqual([])
  })

  it("644品目を読み、すべての区分の表記が区分に当たる", () => {
    expect(items).toHaveLength(644)
    for (const item of items) {
      expect(item.name_ja).not.toMatch(/[\n｡-ﾟ]/)
      for (const r of item.rows) {
        expect(hiroshimaCityAdapter.resolveCategoryId(r.category_label)).not.toBeNull()
      }
    }
  })

  it("参照だけの4品目は、参照先の区分のカードになる", () => {
    expect(find("碁盤")?.rows.map((r) => r.category_label)).toEqual(["可燃ごみ", "その他プラ"])
    expect(find("リュックサック")?.rows).toHaveLength(3)
    expect(find("クーラーボックス（発泡スチロール製）")?.rows).toHaveLength(2)
    expect(find("碁盤")?.rows[0].note?.startsWith("※もったいナビ注: 市の50音事典では")).toBe(true)
  })

  it("モバイルバッテリーの案内を「バッテリー(蓄電池)」の先頭に添える", () => {
    const note = find("バッテリー(蓄電池)")?.rows[0].note ?? ""
    expect(note.startsWith("※もったいナビ注: 自動車・バイク用などの蓄電池のことです。")).toBe(true)
    expect(note).toContain("市では収集しません。")
  })

  it("「小型家電対象(表の上参照)」に説明を添える", () => {
    expect(find("アイロン")?.rows[0].note).toContain("「表の上」は、市の Web の50音事典")
  })
})
