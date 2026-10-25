import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parseCsv } from "../../core/csv"
import { CACHE_DIR } from "../../core/paths"
import { LABEL_JOINER, toStandardCsv } from "./convert"
import { fukuiCityAdapter } from "./index"

const HEAD = "行,音,物品名,キーワード,区分,分類,条件,備考\r\n"

describe("toStandardCsv(福井県の共通8列の CSV、福井市)", () => {
  it("物品名・区分・条件を標準形式の品目・分別区分・注意点にし、連番の ID を振る", () => {
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          "あ,あ,アイロン,あいろん,小型家電,,指定場所に持ち込み,\r\n" +
          ",,,,,,,\r\n" +
          "か,か,乾電池,かんでんち,電池類（資源）,,びん・乾電池の日に出す,備考の文\r\n"
      )
    )
    expect(rows[0]).toEqual([
      "全国地方公共団体コード",
      "ID",
      "品目",
      "分別区分",
      "注意点",
    ])
    expect(rows[1]).toEqual([
      "182010",
      "1",
      "アイロン",
      "小型家電",
      "指定場所に持ち込み",
    ])
    // 備考に値があれば、注意点の後ろに原文のまま足す
    expect(rows[2]).toEqual([
      "182010",
      "2",
      "乾電池",
      "電池類（資源）",
      "びん・乾電池の日に出す\n備考の文",
    ])
    expect(rows).toHaveLength(3)
  })
  it("見出しが違えば止める", () => {
    expect(() => toStandardCsv(HEAD.replace("物品名", "品目名"))).toThrow(
      /見出し/
    )
  })
  it("「分類」に値があれば止める", () => {
    expect(() =>
      toStandardCsv(HEAD + "あ,あ,アイロン,あいろん,小型家電,家電,,\r\n")
    ).toThrow(/分類/)
  })
})

describe("toStandardCsv(市町の設定。鯖江市・越前市・池田町)", () => {
  const base = { cityCode: "182079", cityName: "鯖江市", requireEmptyBunrui: false }

  it("分類に値があっても止めず、市コードを設定から入れる", () => {
    const rows = parseCsv(
      toStandardCsv(HEAD + "あ,あ,アイロン,あいろん,燃えないごみ,電気製品,,\r\n", base)
    )
    expect(rows[1].slice(0, 4)).toEqual(["182079", "1", "アイロン", "燃えないごみ"])
  })

  it("見出しの無い末尾の列は全行空なら読み、値があれば止める(rowFixes の行だけ消す)", () => {
    const head = "行,音,物品名,キーワード,区分,分類,条件,備考,\r\n"
    const opts = { ...base, trailingEmptyColumns: 1 }
    expect(
      parseCsv(toStandardCsv(head + "あ,あ,鍋,なべ,燃えないごみ,日用品,,,\r\n", opts))[1][2]
    ).toBe("鍋")
    expect(() =>
      toStandardCsv(head + "か,け,充電器,じゅうでんき,燃えないごみ,電気製品,条件,大型ごみ,別の品目\r\n", opts)
    ).toThrow(/見出しの無い列/)
    const fixed = parseCsv(
      toStandardCsv(
        head + "か,け,充電器,じゅうでんき,燃えないごみ,電気製品,条件,大型ごみ,別の品目\r\n",
        { ...opts, rowFixes: { 充電器: { dropBiko: true, dropExtra: true } } }
      )
    )
    expect(fixed[1][4]).toBe("条件")
    // 直す行が無くなったら止める(県が直した可能性)
    expect(() =>
      toStandardCsv(head + "あ,あ,鍋,なべ,燃えないごみ,日用品,,,\r\n", {
        ...opts,
        rowFixes: { 充電器: { dropBiko: true } },
      })
    ).toThrow(/rowFixes/)
  })

  it("複数の出し先を区切りの記号にかかわらず LABEL_JOINER でつなぎ直す(keep の表記は分けない)", () => {
    const opts = {
      ...base,
      labelSplit: { pattern: /[・、\s　]+/, keep: ["スプレー・ボンベ類"] },
    }
    const rows = parseCsv(
      toStandardCsv(
        HEAD +
          "あ,あ,充電器,じゅうでんき,ストックヤード・小型家電回収ボックス・  燃やせないごみ,電気製品,,\r\n" +
          "か,か,鍋,なべ,ストックヤード　燃やせないごみ,日用品,,\r\n" +
          "さ,す,スプレー缶,すぷれーかん,スプレー・ボンベ類,日用品,,\r\n",
        opts
      )
    )
    expect(rows[1][3]).toBe(
      ["ストックヤード", "小型家電回収ボックス", "燃やせないごみ"].join(LABEL_JOINER)
    )
    expect(rows[2][3]).toBe(`ストックヤード${LABEL_JOINER}燃やせないごみ`)
    expect(rows[3][3]).toBe("スプレー・ボンベ類")
  })

  it("区切りの記号が無い2区分は labelRewrites で分ける", () => {
    const rows = parseCsv(
      toStandardCsv(HEAD + "あ,あ,アイロン,あいろん,小型家電（15cm×30cmのもの）燃えないごみ,電気製品,,\r\n", {
        ...base,
        labelRewrites: {
          "小型家電（15cm×30cmのもの）燃えないごみ": `小型家電（15cm×30cmのもの）${LABEL_JOINER}燃えないごみ`,
        },
      })
    )
    expect(rows[1][3]).toBe(`小型家電（15cm×30cmのもの）${LABEL_JOINER}燃えないごみ`)
  })
})

describe("福井市のアダプタ(取得済みの CSV で)", () => {
  const items = fukuiCityAdapter.parse(
    readFileSync(join(CACHE_DIR, "fukui-city.csv"), "utf-8")
  )
  const find = (name: string) => items.find((i) => i.name_ja === name)

  it("733品目を読み、区分はすべて区分IDに当たる", () => {
    expect(items).toHaveLength(733)
    for (const item of items)
      for (const row of item.rows)
        expect(
          fukuiCityAdapter.resolveCategoryId(row.category_label)
        ).not.toBeNull()
  })

  it("全部の区分の説明に、越廼・清水地域は別のルールという案内が付く", () => {
    for (const item of items)
      for (const row of item.rows)
        expect(row.note).toContain("越廼・清水地域は")
  })

  it("電池類には 2026-04 からの出す条件(A4・1kg・密封・膨張は窓口)が付く", () => {
    const note = find("モバイルバッテリー")?.rows[0].note ?? ""
    for (const s of ["A4サイズ以下・重さ1kg以下", "密封", "破損・膨張", "黒色のコンテナ"])
      expect(note).toContain(s)
  })

  it("古い行「乾電池(充電式・ボタン式電池)=回収不可」は、注記を先頭に置き、市の原文も残す", () => {
    const note = find("乾電池（充電式・ボタン式電池）")?.rows[0].note ?? ""
    expect(note.startsWith("※もったいナビ注: 市の電池類のページ")).toBe(true)
    expect(note).toContain("市では収集しません。")
    expect(note).toContain("購入先や販売店へ相談して下さい")
  })
})

describe("toStandardCsv(列を名前で探す。高浜町の9列・前置き・見出しの改行)", () => {
  const OPTS = {
    cityCode: "184811",
    cityName: "高浜町",
    requireEmptyBunrui: false,
    preambleRows: 2,
    ignoredColumns: ["連番"],
  }
  const PRE =
    ",,,,,,,可燃ごみの持ち込み先…若狭広域クリーンセンター,\r\n" +
    ",,,,,,,資源ごみの持ち込み先…高浜町リサイクルセンター,\r\n"
  const HEAD9 = '"連\r\n番",行,音,物品名,キーワード,区分,分類,条件,"備\r\n考"\r\n'

  it("前置き2行と先頭の連番の列を読み飛ばし、見出しのセルの改行は取って列を探す", () => {
    const rows = parseCsv(
      toStandardCsv(
        PRE +
          HEAD9 +
          "1,あ,あ,アイロン,あいろん,不燃ごみ,日用品,,\r\n" +
          "2,か,か,乾電池,かんでんち,有害ごみ,日用品,袋に入れて,\r\n",
        OPTS
      )
    )
    expect(rows[1]).toEqual(["184811", "1", "アイロン", "不燃ごみ", ""])
    expect(rows[2]).toEqual(["184811", "2", "乾電池", "有害ごみ", "袋に入れて"])
  })
  it("列の並びが違っても名前で探す", () => {
    const rows = parseCsv(
      toStandardCsv(
        "音,行,物品名,キーワード,条件,区分,分類,備考\r\nあ,あ,アイロン,x,注意,不燃ごみ,,\r\n"
      )
    )
    expect(rows[1]).toEqual(["182010", "1", "アイロン", "不燃ごみ", "注意"])
  })
  it("前置きの行数が違う(見出しが想定の位置に無い)と止める", () => {
    expect(() => toStandardCsv(HEAD9 + "1,あ,あ,x,x,x,,,\r\n", OPTS)).toThrow(
      /見出し/
    )
  })
  it("必要な列が無い・重複している・知らない列があれば止める", () => {
    expect(() =>
      toStandardCsv("行,音,物品名,キーワード,区分,分類,条件\r\n")
    ).toThrow(/見出し/)
    expect(() =>
      toStandardCsv("行,音,物品名,キーワード,区分,分類,条件,備考,条件\r\n")
    ).toThrow(/見出し/)
    expect(() =>
      toStandardCsv("行,音,物品名,キーワード,区分,分類,条件,備考,新しい列\r\n")
    ).toThrow(/見出し/)
  })
  it("dropRows の行を外し、mergeRows の同名・同区分の行は注意点を足して1行にする", () => {
    const rows = parseCsv(
      toStandardCsv(
        PRE +
          HEAD9 +
          "1,い,い,石綿,x,収集できません,住,業者へ,\r\n" +
          "2,か,か,可燃物（振替）,x,可燃物（振替）,他,祝日の説明,\r\n" +
          "3,い,い,石綿,x,収集できません,他,販売店へ,\r\n",
        { ...OPTS, dropRows: ["可燃物（振替）"], mergeRows: ["石綿"] }
      )
    )
    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual([
      "184811",
      "1",
      "石綿",
      "収集できません",
      "業者へ\n販売店へ",
    ])
  })
  it("dropRows・mergeRows の品目が見つからなければ止める", () => {
    expect(() =>
      toStandardCsv(
        PRE + HEAD9 + "1,あ,あ,アイロン,x,不燃ごみ,,,\r\n",
        { ...OPTS, dropRows: ["可燃物（振替）"] }
      )
    ).toThrow(/dropRows/)
  })
})
