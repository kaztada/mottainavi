import { describe, expect, it } from "vitest"
import type { RegistryEntry } from "../../src/lib/schemas"
import {
  analyzeTable,
  classifyLicense,
  dataYear,
  indexRegistry,
  isGarbageRelated,
  judgeDataset,
  matchMunicipality,
  namesIn,
  normalizePackage,
  proposeFor,
  titleSignal,
  type CatalogDef,
  type Dataset,
  type DatasetVerdict,
  type SourceStatus,
} from "./catalog"

const reg = (
  slug: string,
  lg_code: string,
  pref: string,
  name_ja: string
): RegistryEntry => ({
  slug,
  lg_code,
  pref,
  name_ja,
  name_en: slug,
  status: "unsupported",
  official_url: null,
})

const registry = [
  reg("yamaga-city", "432083", "熊本県", "山鹿市"),
  reg("setagaya-ku", "131121", "東京都", "世田谷区"),
  reg("yamato-city", "142131", "神奈川県", "大和市"),
  reg("higashiyamato-city", "132209", "東京都", "東大和市"),
  reg("tokyo-fuchu-city", "132063", "東京都", "府中市"),
  reg("hiroshima-fuchu-city", "342084", "広島県", "府中市"),
  reg("machida-city", "132098", "東京都", "町田市"),
]
const idx = indexRegistry(registry)

const BODIK: CatalogDef = {
  id: "bodik",
  label: "BODIK",
  site: "https://data.bodik.jp/",
  kind: "ckan",
  api: "https://data.bodik.jp/api/3/action",
  datasetUrl: "https://data.bodik.jp/dataset/{name}",
  orgCode: "lg",
}
const TOKYO: CatalogDef = { ...BODIK, id: "tokyo", label: "東京都", orgCode: "t-lg" }
const SEARCH: CatalogDef = {
  id: "search-ckan-jp",
  label: "search.ckan.jp",
  site: "https://search.ckan.jp/",
  kind: "search-ckan",
}

const pkg = (over: Record<string, unknown> = {}) => ({
  name: "432083_bunbetsu",
  title: "ごみ分別",
  license_id: "cc-by-40-intl",
  license_title: "Creative Commons Attribution 4.0 International",
  metadata_modified: "2025-08-01T04:25:45",
  organization: { name: "432083", title: "山鹿市" },
  tags: [{ name: "ごみ" }],
  notes: "",
  resources: [
    {
      id: "r1",
      name: "ごみ分別_csv",
      format: "CSV",
      url: "https://data.bodik.jp/x/202403_bunbetsu.csv",
      last_modified: "2025-05-23T11:14:53",
    },
  ],
  ...over,
})

describe("CKAN の応答をそろえる", () => {
  it("SHIRASAGI: 地域のコード・題名・download_url・リソースのライセンスの名前", () => {
    const ds = normalizePackage(
      {
        id: 1694,
        name: "室蘭市家庭系ごみ分別一覧",
        url: "https://www.harp.lg.jp/opendata/dataset/1694.html",
        updated: "2023-04-28T12:50:06+09:00",
        areas: [{ name: "室蘭市", filename: "chiiki/012050" }],
        tags: ["室蘭"],
        resources: [
          {
            name: "a.csv",
            format: "CSV",
            url: "https://www.harp.lg.jp/fs/5/_/a.csv",
            download_url: "https://www.harp.lg.jp/opendata/dataset/1694/resource/1/a.csv",
            license: { id: 1, name: "表示（CC BY）" },
            updated: "2022-04-27T16:48:17+09:00",
          },
        ],
      },
      { ...BODIK, id: "harp", licenseByTitle: true, datasetUrl: undefined }
    )
    expect(ds).toMatchObject({
      id: "1694",
      title: "室蘭市家庭系ごみ分別一覧",
      url: "https://www.harp.lg.jp/opendata/dataset/1694.html",
      org: { id: "012050", title: "室蘭市" },
    })
    expect(ds.resources[0].url).toBe("https://www.harp.lg.jp/opendata/dataset/1694/resource/1/a.csv")
    expect(classifyLicense(ds.resources[0].license, ds)).toBe("open")
    // 名前で照らすのは SHIRASAGI だけ
    expect(classifyLicense(ds.resources[0].license)).toBe("unknown")
  })
  it("dataeye: 数の ID・リソースごとのライセンス", () => {
    const ds = normalizePackage(
      { name: 4868, title: "【岩国市】ゴミの分別方法一覧", organization: { name: 95, title: "岩国市" }, resources: [{ name: "x.csv", format: "csv", url: "https://h/resource_download/1", resource_license_id: "pdl" }] },
      { ...BODIK, id: "hiroshima", orgCode: undefined, datasetUrl: "https://h/datasets/{name}" }
    )
    expect(ds.url).toBe("https://h/datasets/4868")
    expect(classifyLicense(ds.resources[0].license)).toBe("open")
  })
  it("BODIK: 組織・ライセンス・リソース・ページの URL", () => {
    const ds = normalizePackage(pkg(), BODIK)
    expect(ds.url).toBe("https://data.bodik.jp/dataset/432083_bunbetsu")
    expect(ds.org).toEqual({ id: "432083", title: "山鹿市" })
    expect(ds.resources[0]).toMatchObject({
      format: "CSV",
      modified: "2025-05-23T11:14:53",
      license: { id: "cc-by-40-intl" },
    })
  })
  it("search.ckan.jp: 元のサイトのページ・サイト名・ID を使う", () => {
    const ds = normalizePackage(
      pkg({
        xckan_id: "data.bodik.jp__dataset:402036_x",
        xckan_site_url: "https://data.bodik.jp/dataset/402036_x",
        xckan_site_name: "BODIK ODCS",
      }),
      SEARCH
    )
    expect(ds.url).toBe("https://data.bodik.jp/dataset/402036_x")
    expect(ds.site).toBe("BODIK ODCS")
    expect(ds.id).toBe("data.bodik.jp__dataset:402036_x")
  })
})

describe("題名の手がかり", () => {
  it("ごみに関係するかは広く拾う", () => {
    expect(isGarbageRelated(normalizePackage(pkg(), BODIK))).toBe(true)
    expect(
      isGarbageRelated(
        normalizePackage(pkg({ title: "AED 設置場所", tags: [], resources: [] }), BODIK)
      )
    ).toBe(false)
  })
  it("品目らしい語・品目でなさそうな語", () => {
    expect(titleSignal("ごみ分別表")).toBe("item")
    expect(titleSignal("ごみ収集カレンダー")).toBe("non-item")
    expect(titleSignal("ごみ")).toBe("neutral")
  })
})

describe("表の見出し", () => {
  const std = ["ゴミの分別方法_全国地方公共団体コード", "ゴミの分別方法_ID", "ゴミの分別方法_品目", "ゴミの分別方法_分別区分", "ゴミの分別方法_注意点"]
  const rows = (n: number, code = "432083") =>
    Array.from({ length: n }, (_, i) => [code, String(i), `品目${i}`, "燃やすごみ", ""])

  it("標準形式で50行以上なら品目の一覧。団体コードの列も読む", () => {
    const t = analyzeTable([std, ...rows(60)])
    expect(t).toMatchObject({ kind: "item-list", standard: true, rows: 60, codes: ["432083"] })
  })
  it("見出しが2行目にあっても見つける。独自の列名(品名・出し方)も品目の一覧", () => {
    const t = analyzeTable([["ごみの分け方一覧"], ["品名", "出し方", "備考"], ...rows(55).map((r) => [r[2], r[3], ""])])
    expect(t).toMatchObject({ kind: "item-list", standard: false, rows: 55 })
  })
  it("標準形式の新しい版(地方公共団体名・ゴミの品目)も標準形式。団体コードは列の名前で読む", () => {
    const h = ["全国地方公共団体コード", "ID", "地方公共団体名", "ゴミの品目", "分別区分", "注意点"]
    const body = Array.from({ length: 60 }, (_, i) => ["012050", `${i}`, "室蘭市", `品${i}`, "可燃", ""])
    expect(analyzeTable([h, ...body])).toMatchObject({ kind: "item-list", standard: true, codes: ["012050"] })
  })
  it("英語の標準形式・列名の書き方の違い(品目_1・分類・ごみの種類)", () => {
    const body = Array.from({ length: 60 }, (_, i) => ["x", `${i}`, `品${i}`, "可燃"])
    expect(analyzeTable([["localGovernmentCode", "identifier", "itemName", "sortingType"], ...body]).kind).toBe("item-list")
    expect(analyzeTable([["索引", "品目_1", "品目_2", "分別区分"], ...body]).kind).toBe("item-list")
    expect(analyzeTable([["No", "品目", "素材等", "分類"], ...body]).kind).toBe("item-list")
    expect(analyzeTable([["No", "音", "ごみの種類", "区分"], ...body]).kind).toBe("item-list")
  })
  it("1行目が表の題名の統計・業者の一覧は品目の一覧ではない", () => {
    expect(analyzeTable([["一般廃棄物収集運搬許可業者一覧表", "", ""]]).kind).toBe("not-item")
    expect(analyzeTable([["124.ごみ処理・資源物回収状況", "", ""]]).kind).toBe("not-item")
  })
  it("5374 の形式(type・name)も品目の一覧", () => {
    const body = Array.from({ length: 60 }, (_, i) => [`${i}`, "燃やすごみ", `品${i}`, "", ""])
    expect(analyzeTable([["mastercode", "type", "name", "notice", "furigana"], ...body]).kind).toBe("item-list")
  })
  it("区分の定義だけの表・施設・統計は品目の一覧ではない", () => {
    expect(analyzeTable([["全国地方公共団体コード", "ID", "地方公共団体名", "分別区分", "ゴミ区分", "ゴミ分類区分"]]).kind).toBe("not-item")
    expect(analyzeTable([["名称", "施設概要", "郵便番号", "住所", "電話番号"]]).kind).toBe("not-item")
    expect(analyzeTable([["月", "1月[回]", "2月[回]"]]).kind).toBe("not-item")
  })
  it("50行未満は決めきれない(要確認)", () => {
    expect(analyzeTable([std, ...rows(9)]).kind).toBe("unknown")
  })
  it("カレンダー・集積所の表は品目の一覧ではない", () => {
    expect(analyzeTable([["地区", "収集日", "曜日"], ["A", "1", "月"]]).kind).toBe("not-item")
    expect(analyzeTable([["名称", "住所", "緯度", "経度"]]).kind).toBe("not-item")
  })
  it("見出しが無い表は決めきれない(長浜市のような例)", () => {
    expect(analyzeTable(rows(60)).kind).toBe("unknown")
  })
})

describe("ライセンス", () => {
  it("登録の ID・URL と完全一致のものだけ使えそう", () => {
    expect(classifyLicense({ id: "cc-by-40-intl", title: null, url: null })).toBe("open")
    expect(classifyLicense({ id: "PDL1.0", title: null, url: null })).toBe("open")
    expect(
      classifyLicense({ id: null, title: null, url: "https://creativecommons.org/licenses/by/4.0/" })
    ).toBe("open")
  })
  it("名前だけ・その他・空は不明", () => {
    expect(classifyLicense({ id: null, title: "CC BY", url: null })).toBe("unknown")
    expect(classifyLicense({ id: "other-at", title: "その他", url: null })).toBe("unknown")
    expect(classifyLicense({ id: null, title: null, url: null })).toBe("unknown")
  })
})

describe("データの基準日", () => {
  it("令和・R・西暦・年月のファイル名", () => {
    expect(dataYear(["令和8年度 ごみ分別"])).toBe(2026)
    expect(dataYear(["ごみ分別表(R6)"])).toBe(2024)
    expect(dataYear(["https://x/202403_bunbetsu.csv"])).toBe(2024)
    expect(dataYear(["ごみ分別 2025年版"])).toBe(2025)
  })
  it("読めなければ null(新しい扱いにしない)", () => {
    expect(dataYear(["ごみ分別"])).toBeNull()
  })
})

describe("自治体との結びつけ", () => {
  it("長い名前を先に当てる(東大和市の中の大和市を数えない)", () => {
    expect(namesIn("東大和市ごみ分別", idx)).toEqual(["東大和市"])
  })
  it("BODIK・東京都は組織 ID のコードで確定", () => {
    expect(matchMunicipality(normalizePackage(pkg(), BODIK), BODIK, idx)).toEqual({
      kind: "matched",
      slug: "yamaga-city",
      by: "org-code",
    })
    const tokyo = normalizePackage(pkg({ organization: { name: "t131121", title: "世田谷区" } }), TOKYO)
    expect(matchMunicipality(tokyo, TOKYO, idx)).toMatchObject({ slug: "setagaya-ku" })
  })
  it("同じ名前の自治体は都道府県名で絞り、絞れなければ要確認", () => {
    const withPref = normalizePackage(
      pkg({ organization: { name: "x", title: "東京都府中市" } }),
      SEARCH
    )
    expect(matchMunicipality(withPref, SEARCH, idx)).toMatchObject({ slug: "tokyo-fuchu-city" })
    const noPref = normalizePackage(pkg({ organization: { name: "x", title: "府中市" } }), SEARCH)
    expect(matchMunicipality(noPref, SEARCH, idx)).toMatchObject({ kind: "review" })
  })
  it("組合・広域の組織は要確認(構成市町村に広げない)", () => {
    const ds = normalizePackage(
      pkg({ organization: { name: "x", title: "那須地域定住自立圏" } }),
      SEARCH
    )
    expect(matchMunicipality(ds, SEARCH, idx).kind).toBe("review")
  })
  it("市の自前のカタログはその市", () => {
    const own: CatalogDef = { ...SEARCH, id: "machida", kind: "ckan", municipality: "machida-city" }
    const ds = normalizePackage(pkg({ organization: { name: "x", title: "収集業務課" } }), own)
    expect(matchMunicipality(ds, own, idx)).toMatchObject({ slug: "machida-city", by: "own-catalog" })
  })
})

describe("データセットの判定", () => {
  const std = ["ゴミの分別方法_全国地方公共団体コード", "ゴミの分別方法_ID", "ゴミの分別方法_品目", "ゴミの分別方法_分別区分", "ゴミの分別方法_注意点"]
  const table = (code: string) =>
    analyzeTable([std, ...Array.from({ length: 60 }, (_, i) => [code, `${i}`, `品${i}`, "可燃", ""])])
  const ds: Dataset = normalizePackage(pkg(), BODIK)
  const url = ds.resources[0].url

  it("品目の一覧で団体コードが合えば item-list(形式・基準日・ライセンスつき)", () => {
    const v = judgeDataset(ds, matchMunicipality(ds, BODIK, idx), [{ url, table: table("432083") }], idx)
    expect(v).toMatchObject({ verdict: "item-list", slug: "yamaga-city", format: "standard", license: "open", dataYear: 2024, rows: 60 })
  })
  it("団体コードが合わなければ要確認", () => {
    const v = judgeDataset(ds, matchMunicipality(ds, BODIK, idx), [{ url, table: table("999999") }], idx)
    expect(v.verdict).toBe("review")
  })
  it("取得できなかったら要確認", () => {
    const v = judgeDataset(ds, matchMunicipality(ds, BODIK, idx), [{ url, error: "応答 404" }], idx)
    expect(v.verdict).toBe("review")
  })
  it("品目らしい題名の PDF は要確認", () => {
    const pdf = normalizePackage(
      pkg({ title: "ごみ分別ハンドブック", resources: [{ name: "冊子", format: "PDF", url: "https://x/a.pdf" }] }),
      BODIK
    )
    const v = judgeDataset(pdf, matchMunicipality(pdf, BODIK, idx), [], idx)
    expect(v).toMatchObject({ verdict: "review", format: "pdf" })
  })
  it("カレンダーの題名で表が無ければ品目の一覧ではない", () => {
    const cal = normalizePackage(
      pkg({ title: "ごみ収集カレンダー", resources: [{ name: "R8", format: "PDF", url: "https://x/c.pdf" }] }),
      BODIK
    )
    expect(judgeDataset(cal, matchMunicipality(cal, BODIK, idx), [], idx).verdict).toBe("not-item")
  })
})

describe("台帳への提案", () => {
  const e = registry[0]
  const today = "2026-10-17"
  const v = (over: Partial<DatasetVerdict>): DatasetVerdict => ({
    catalog: "bodik",
    dataset: "d",
    datasetUrl: "https://data.bodik.jp/dataset/d",
    title: "ごみ分別",
    slug: "yamaga-city",
    verdict: "item-list",
    reason: "品目と分け方の列がある",
    resourceUrl: "https://data.bodik.jp/x.csv",
    format: "standard",
    license: "open",
    licenseLabel: "cc-by-40-intl",
    dataYear: 2026,
    catalogDate: "2026-04-01",
    rows: 900,
    ...over,
  })
  const done: SourceStatus[] = [
    { id: "bodik", label: "BODIK", url: "https://data.bodik.jp/", complete: true, checked_at: today },
  ]
  const unsurveyed = { status: "unsurveyed" }

  it("品目の一覧+使えそうなライセンス → 確認中(第1群の見込みを note に)", () => {
    const p = proposeFor(e, unsurveyed, [v({})], done, { today, catalogOnly: true })
    expect(p.bucket).toBe("candidate")
    expect(p.entry).toMatchObject({ status: "candidate", checked_at: today })
    expect(String(p.entry?.note)).toContain("第1群の見込み")
  })
  it("ライセンスが登録から確かめられなくても確認中(原文は抜き取り照合で確かめる)", () => {
    const p = proposeFor(e, unsurveyed, [v({ license: "unknown", licenseLabel: "(なし)" })], done, { today, catalogOnly: true })
    expect(p.entry).toMatchObject({ status: "candidate" })
    expect(String(p.entry?.note)).toContain("原文を確かめる")
  })
  it("要確認が残れば書かない", () => {
    const p = proposeFor(e, unsurveyed, [v({ verdict: "review", reason: "PDF" })], done, { today, catalogOnly: true })
    expect(p).toMatchObject({ bucket: "review", entry: null })
  })
  it("最後まで調べ終わっていない探し先があれば書かない", () => {
    const p = proposeFor(e, unsurveyed, [], [{ ...done[0], complete: false }], { today, catalogOnly: true })
    expect(p).toMatchObject({ bucket: "incomplete", entry: null })
  })
  it("すべて調べ終わって何も無ければ見つからない(カタログだけなら、その旨を画面に)", () => {
    const p = proposeFor(e, unsurveyed, [v({ verdict: "not-item" })], done, { today, catalogOnly: true })
    expect(p.entry).toMatchObject({
      status: "no-data",
      detail_ja: "国内のオープンデータのカタログで探しました。山鹿市のサイトは個別には確かめていません。",
      searched: [{ label: "BODIK", url: "https://data.bodik.jp/" }],
    })
    const own = proposeFor(e, unsurveyed, [], done, { today, catalogOnly: false })
    expect(own.entry?.detail_ja).toBeUndefined()
  })
  it("調べ済みの市は書き換えず、新しいデータがあれば見直し候補", () => {
    expect(proposeFor(e, { status: "no-data" }, [v({})], done, { today, catalogOnly: true })).toMatchObject({
      bucket: "surveyed-review",
      entry: null,
    })
    expect(proposeFor(e, { status: "hold" }, [], done, { today, catalogOnly: true }).bucket).toBe("surveyed")
  })
})
