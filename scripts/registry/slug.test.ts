import { describe, expect, it } from "vitest"
import {
  hiraganaToSlugPart,
  municipalityNameEn,
  municipalitySlug,
  prefectureSlugPart,
} from "./slug"

describe("municipalitySlug", () => {
  it("既存の大阪市は osaka-city(URL互換)", () => {
    expect(municipalitySlug("大阪市", "ｵｵｻｶｼ")).toBe("osaka-city")
  })
  it("町(まち/ちょう)・村(むら/そん)・特別区", () => {
    expect(municipalitySlug("森町", "ﾓﾘﾏﾁ")).toBe("mori-town")
    expect(municipalitySlug("美郷町", "ﾐｻﾄﾁｮｳ")).toBe("misato-town")
    expect(municipalitySlug("檜枝岐村", "ﾋﾉｴﾏﾀﾑﾗ")).toBe("hinoemata-village")
    expect(municipalitySlug("大和村", "ﾔﾏﾄｿﾝ")).toBe("yamato-village")
    expect(municipalitySlug("千代田区", "ﾁﾖﾀﾞｸ")).toBe("chiyoda-ku")
  })
  it("長音は慣用表記に寄せる", () => {
    expect(hiraganaToSlugPart("とうきょう")).toBe("tokyo")
    expect(hiraganaToSlugPart("きょうと")).toBe("kyoto")
    expect(hiraganaToSlugPart("おうめ")).toBe("ome")
  })
  it("撥音+母音の区切り記号は落とす", () => {
    expect(hiraganaToSlugPart("しんおんせん")).toMatch(/^[a-z]+$/)
  })
  it("読みの末尾が種別と合わなければエラー", () => {
    expect(() => municipalitySlug("大阪市", "ｵｵｻｶ")).toThrow()
  })
})

describe("prefectureSlugPart", () => {
  it("都道府県の接尾辞を除く(北海道はそのまま)", () => {
    expect(prefectureSlugPart("東京都", "ﾄｳｷｮｳﾄ")).toBe("tokyo")
    expect(prefectureSlugPart("大阪府", "ｵｵｻｶﾌ")).toBe("osaka")
    expect(prefectureSlugPart("広島県", "ﾋﾛｼﾏｹﾝ")).toBe("hiroshima")
    expect(prefectureSlugPart("北海道", "ﾎｯｶｲﾄﾞｳ")).toBe("hokkaido")
  })
})

describe("municipalityNameEn", () => {
  it("slug から英語名", () => {
    expect(municipalityNameEn("osaka-city")).toBe("Osaka City")
    expect(municipalityNameEn("tokyo-fuchu-city")).toBe("Tokyo Fuchu City")
    expect(municipalityNameEn("mori-town")).toBe("Mori Town")
  })
})
