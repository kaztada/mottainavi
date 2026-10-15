import { describe, expect, it } from "vitest"
import {
  candidatesFor,
  decideOfficialUrl,
  detectCharset,
  extractTitle,
  isTopPage,
  lgJpVariant,
  looksLikeMunicipalHost,
  normalizeUrl,
  romajiOf,
  titleMatches,
  type WikidataSite,
} from "./official-url"

const NORMAL = "http://wikiba.se/ontology#NormalRank"
const DEPRECATED = "http://wikiba.se/ontology#DeprecatedRank"

describe("Wikidata の候補", () => {
  const sites: WikidataSite[] = [
    { code: "011002", url: "https://www.city.sapporo.jp/", rank: NORMAL },
    { code: "011002", url: "http://www.city.sapporo.jp/", rank: DEPRECATED },
    {
      code: "011002",
      url: "https://old.example.jp/",
      rank: NORMAL,
      end: "2020-01-01",
    },
    { code: "011002", url: "ftp://www.city.sapporo.jp/", rank: NORMAL },
    { code: "012025", url: "https://www.city.hakodate.hokkaido.jp/", rank: NORMAL },
    {
      code: "012025",
      url: "https://www.city.hakodate.hokkaido.jp/docs/2014013100457/",
      rank: NORMAL,
    },
  ]

  it("非推奨・終了日つき・http(s) 以外は除く", () => {
    expect(candidatesFor("011002", sites)).toEqual(["https://www.city.sapporo.jp/"])
  })

  it("トップページの候補があれば、それだけにする(外国語のページなどを除く)", () => {
    expect(candidatesFor("012025", sites)).toEqual([
      "https://www.city.hakodate.hokkaido.jp/",
    ])
    expect(isTopPage("https://www.city.x.lg.jp/index.html")).toBe(true)
    expect(isTopPage("https://www.city.x.lg.jp/docs/1/")).toBe(false)
  })
})

describe("ホスト名の判定", () => {
  it("lg.jp と、city / town などのラベルがある .jp は自治体のサイトらしい", () => {
    expect(looksLikeMunicipalHost("www.city.otaru.lg.jp", ["otaru"])).toBe(true)
    expect(looksLikeMunicipalHost("www.city.sapporo.jp", ["sapporo"])).toBe(true)
    expect(looksLikeMunicipalHost("www.town.x.hokkaido.jp", ["x"])).toBe(true)
  })

  it("名前のローマ字を含む .jp は自治体のサイトらしい(書き方のゆれも同じとみなす)", () => {
    expect(looksLikeMunicipalHost("www.e-rumoi.jp", ["rumoi"])).toBe(true)
    expect(looksLikeMunicipalHost("mombetsu.jp", romajiOf("monbetsu-city"))).toBe(
      true
    )
  })

  it("部分一致ではなくホスト名で判定する(.jp でない・名前を含まない)", () => {
    expect(looksLikeMunicipalHost("city.sapporo.jp.evil.com", ["sapporo"])).toBe(
      false
    )
    expect(looksLikeMunicipalHost("www.example.jp", ["sapporo"])).toBe(false)
  })

  it("slug から名前のローマ字(都道府県が前に付く slug は最後の部分も)", () => {
    expect(romajiOf("sapporo-city")).toEqual(["sapporo"])
    expect(romajiOf("osaka-sakai-city")).toEqual(["osakasakai", "sakai"])
  })
})

describe("題名の判定", () => {
  const fuchu = { name_ja: "府中市", pref: "東京都" }
  it("題名に自治体の名前がある", () => {
    expect(titleMatches("札幌市公式ホームページ", { name_ja: "札幌市", pref: "北海道" }, false)).toBe(true)
    expect(titleMatches("トップページ", { name_ja: "札幌市", pref: "北海道" }, false)).toBe(false)
  })
  it("同じ名前の自治体がほかにあるときは、都道府県名も要る", () => {
    expect(titleMatches("府中市ホームページ", fuchu, true)).toBe(false)
    expect(titleMatches("東京都府中市ホームページ", fuchu, true)).toBe(true)
  })
  it("題名を取り出す・文字コードを読む", () => {
    expect(extractTitle("<html><title>\n 札幌市 &amp; 公式 </title>")).toBe(
      "札幌市 & 公式"
    )
    expect(detectCharset("text/html; charset=Shift_JIS", "")).toBe("shift_jis")
    expect(detectCharset(null, '<meta charset="EUC-JP">')).toBe("euc-jp")
    expect(
      detectCharset(null, '<meta http-equiv="Content-Type" content="text/html; charset=shift_jis">')
    ).toBe("shift_jis")
  })
})

describe("入れる URL を決める", () => {
  const ok = (final: string) => ({
    candidate: final,
    checked_at: "2026-10-15",
    ok: true,
    final_url: final,
  })
  it("通った候補の行き先が1つなら入れる", () => {
    expect(decideOfficialUrl([ok("https://www.city.a.lg.jp/index.html?x=1")]).url).toBe(
      "https://www.city.a.lg.jp/"
    )
  })
  it("行き先が複数なら入れない", () => {
    expect(
      decideOfficialUrl([ok("https://www.city.a.lg.jp/"), ok("https://www.city.b.lg.jp/")])
        .url
    ).toBeNull()
  })
  it("通った候補が無ければ入れない(理由を残す)", () => {
    const r = decideOfficialUrl([
      { candidate: "x", checked_at: "2026-10-15", ok: false, reason: "応答 404" },
    ])
    expect(r).toEqual({ url: null, reason: "応答 404" })
    expect(decideOfficialUrl([]).reason).toBe("Wikidata に候補が無い")
  })
  it("確かめていない候補が残っていれば入れない(--limit で途中までにしたとき)", () => {
    const r = decideOfficialUrl([ok("https://www.city.a.lg.jp/")], 1)
    expect(r.url).toBeNull()
    expect(r.reason).toContain("確かめていない候補")
  })
  it("URL の正規化", () => {
    expect(normalizeUrl("https://www.city.a.lg.jp/index.php#top")).toBe(
      "https://www.city.a.lg.jp/"
    )
  })
})

describe("古いドメインから .lg.jp の形を作る", () => {
  it("都道府県つきの古いドメインから作る", () => {
    expect(lgJpVariant("https://www.city.kuji.iwate.jp/")).toBe(
      "https://www.city.kuji.lg.jp/"
    )
    expect(lgJpVariant("http://www.town.koshimizu.hokkaido.jp/")).toBe(
      "https://www.town.koshimizu.lg.jp/"
    )
    expect(lgJpVariant("http://city.sapporo.jp/")).toBe(
      "https://www.city.sapporo.lg.jp/"
    )
  })
  it("すでに .lg.jp、または city / town などの形でなければ作らない", () => {
    expect(lgJpVariant("https://www.city.otaru.lg.jp/")).toBeNull()
    expect(lgJpVariant("https://www.e-rumoi.jp/")).toBeNull()
    expect(lgJpVariant("https://www.kuromatsunai.com/")).toBeNull()
  })
})
