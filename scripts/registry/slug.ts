import { toRomaji } from "wanakana"
import { katakanaToHiragana } from "../../src/lib/search"

/** 自治体の種別(名前の末尾の漢字で決まる) */
export type MunicipalityType = "city" | "town" | "village" | "ku"

export function municipalityType(nameJa: string): MunicipalityType {
  if (nameJa.endsWith("市")) return "city"
  if (nameJa.endsWith("町")) return "town"
  if (nameJa.endsWith("村")) return "village"
  if (nameJa.endsWith("区")) return "ku"
  throw new Error(`市区町村の種別を判定できません: ${nameJa}`)
}

/** 種別ごとの読みの末尾(「町」はまち/ちょう、「村」はむら/そん) */
const SUFFIX_READINGS: Record<MunicipalityType, string[]> = {
  city: ["し"],
  town: ["ちょう", "まち"],
  village: ["むら", "そん"],
  ku: ["く"],
}

/** 総務省データの半角カナ読み → ひらがな(NFKC で全角化してから変換) */
export function kanaToHiragana(kana: string): string {
  return katakanaToHiragana(kana.normalize("NFKC")).replace(/[\s　]/g, "")
}

/** 読みから種別の末尾(し/ちょう/まち 等)を取り除く */
export function stripSuffixReading(
  hiragana: string,
  type: MunicipalityType
): string {
  for (const s of SUFFIX_READINGS[type]) {
    if (hiragana.endsWith(s) && hiragana.length > s.length) {
      return hiragana.slice(0, -s.length)
    }
  }
  throw new Error(`読みの末尾が種別(${type})と一致しません: ${hiragana}`)
}

/**
 * ひらがな → URL用ローマ字。
 * 長音は慣用表記に寄せる(おお→o、おう→o、うう→u。例: おおさか → osaka、とうきょう → tokyo)。
 */
export function hiraganaToSlugPart(hiragana: string): string {
  return toRomaji(hiragana.replace(/ー/g, ""))
    .toLowerCase()
    .replace(/oo/g, "o")
    .replace(/ou/g, "o")
    .replace(/uu/g, "u")
    .replace(/[^a-z]/g, "")
}

/** 市区町村の slug を作る(例: 大阪市/ｵｵｻｶｼ → osaka-city) */
export function municipalitySlug(nameJa: string, kana: string): string {
  const type = municipalityType(nameJa)
  const base = hiraganaToSlugPart(
    stripSuffixReading(kanaToHiragana(kana), type)
  )
  if (!base) throw new Error(`slugを生成できません: ${nameJa}`)
  return `${base}-${type}`
}

/** 都道府県の slug 用の前置語(例: 東京都/ﾄｳｷｮｳﾄ → tokyo、北海道 → hokkaido) */
export function prefectureSlugPart(prefJa: string, prefKana: string): string {
  const h = kanaToHiragana(prefKana)
  let stem = h
  if (prefJa.endsWith("都") && h.endsWith("と")) stem = h.slice(0, -1)
  else if (prefJa.endsWith("府") && h.endsWith("ふ")) stem = h.slice(0, -1)
  else if (prefJa.endsWith("県") && h.endsWith("けん")) stem = h.slice(0, -2)
  return hiraganaToSlugPart(stem)
}

/** 英語名(例: osaka-city → Osaka City)。特別区は英語で City を名乗る区が多いため City とする */
export function municipalityNameEn(slug: string): string {
  const m = slug.match(/^(.*)-(city|town|village|ku)$/)
  if (!m) throw new Error(`英語名を作れない slug: ${slug}`)
  const base = m[1]
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
  const suffix = { city: "City", town: "Town", village: "Village", ku: "City" }[
    m[2] as MunicipalityType
  ]
  return `${base} ${suffix}`
}
