import type { RawItem } from "../../core/types"
import { parseCsv } from "../yokohama-city/csv"
import { NOT_COLLECTED, OFFICIAL_LINK, resolveCategoryId } from "./category-map"

const P = "ごみの分別方法_"
const EXPECTED_HEADER = [
  "全国地方公共団体コード",
  "ID",
  "品目",
  "分別区分",
  "注意点",
].map((h) => P + h)

/** 粗大ごみの全品目の注意文言の先頭に置く、市のページ(粗大ごみ回収の申込み)の説明 */
export const SODAI_NOTE =
  "事前予約制の各戸収集です(有料。原則1立方メートルにつき3,500円)。"

export interface HiratsukaRow {
  name: string
  label: string
  note: string
}

/**
 * 半角カナ(と半角の句読点・中黒・長音)だけを全角にする。
 * 文字列全体を NFKC にすると全角のかっこ・英数まで変わるため、半角カナの連続部分だけを変換する。
 */
export function toFullWidthKana(s: string): string {
  return s.replace(/[｡-ﾟ]+/g, (m) => m.normalize("NFKC"))
}

/** CSV テキスト → 行オブジェクト(ヘッダ検証つき。市が列構成を変えたら気づけるように) */
export function readRows(csvText: string): HiratsukaRow[] {
  const rows = parseCsv(csvText)
  const header = rows[0]?.map((h) => h.trim())
  if (!header || EXPECTED_HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(
      `平塚市CSVの列構成が想定と違います: ${JSON.stringify(header)}`
    )
  }
  return rows
    .slice(1)
    .filter((r) => r.length >= 4 && r[2].trim())
    .map((r) => ({
      name: toFullWidthKana(r[2].trim()),
      label: r[3].trim(),
      note: toFullWidthKana((r[4] ?? "").trim()),
    }))
}

/** 「不燃ごみ又は処理困難物」のような1セル2区分の表記を区分ごとに分ける */
export function splitLabels(label: string): string[] {
  return label
    .split("又は")
    .map((l) => l.trim())
    .filter(Boolean)
}

/**
 * 市の表記を残した注意文言を作る(市の注意点は変えない)。
 * - 市では収集しない区分は、注意点の有無にかかわらず「市では収集しません。」を先頭に置く(誤案内リスク最大の区分のため)
 * - 1セル2区分の品目は、組み合わせ表記の原文を「出し方: …。」として1枚目のカードに残す
 * - 粗大ごみは市のページの説明(事前予約制・有料)を先頭に置く
 */
export function buildNote(
  categoryId: string | null,
  rawNote: string,
  combinedLabel: string | null = null
): string | null {
  const parts: string[] = []
  if (categoryId && NOT_COLLECTED.has(categoryId)) {
    parts.push("市では収集しません。")
  }
  if (combinedLabel) parts.push(`出し方: ${combinedLabel}。`)
  if (categoryId === "sodai") parts.push(SODAI_NOTE)
  const body = rawNote.replace(/\n{3,}/g, "\n\n").trim()
  if (body) parts.push(body)
  return parts.length ? parts.join("\n") : null
}

/** CSV テキスト → 共通パイプラインの生レコード */
export function parseHiratsukaCsv(csvText: string): RawItem[] {
  return readRows(csvText).map((r) => {
    const labels = splitLabels(r.label)
    const combined = labels.length > 1 ? r.label : null
    return {
      name_ja: r.name,
      rows: labels.map((label, i) => {
        const categoryId = resolveCategoryId(label)
        return {
          category_label: label,
          note: buildNote(categoryId, r.note, i === 0 ? combined : null),
          official_link: categoryId
            ? (OFFICIAL_LINK[categoryId] ?? null)
            : null,
        }
      }),
    }
  })
}
