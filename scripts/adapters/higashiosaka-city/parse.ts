import type { RawItem } from "../../core/types"
import { parseCsv } from "../yokohama-city/csv"
import {
  OFFICIAL_LINK,
  SAME_AS_CATEGORY,
  normalizeLabel,
  resolveCategoryId,
} from "./category-map"

const P = "ゴミの分別方法_"
const EXPECTED_HEADER = [
  "全国地方公共団体コード",
  "ID",
  "品目",
  "分別区分",
  "注意点",
].map((h) => P + h)

export interface HigashiosakaRow {
  name: string
  label: string
  note: string
}

/** CSV テキスト → 行オブジェクト(ヘッダ検証つき。市が列構成を変えたら気づけるように) */
export function readRows(csvText: string): HigashiosakaRow[] {
  const rows = parseCsv(csvText)
  const header = rows[0]?.map((h) => h.trim())
  if (!header || EXPECTED_HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(
      `東大阪市CSVの列構成が想定と違います: ${JSON.stringify(header)}`
    )
  }
  return rows
    .slice(1)
    .filter((r) => r.length >= 4 && r[2].trim())
    .map((r) => ({
      name: r[2].trim(),
      label: r[3].trim(),
      note: (r[4] ?? "").trim(),
    }))
}

/**
 * 市の表記を残した注意文言を作る(文言は変えない)。
 * - 「不可」は注意点の有無にかかわらず「市では収集しません。」を先頭に置く(誤案内リスク最大の区分のため)
 * - 表記ゆれ以外で区分名と違う表記(回収協力店の種類・個別指示)は「出し方: <市の表記>。」を先頭に置く
 */
export function buildNote(
  label: string,
  categoryId: string | null,
  rawNote: string
): string | null {
  const parts: string[] = []
  if (categoryId === "fuka") {
    parts.push("市では収集しません。")
  } else if (categoryId && !SAME_AS_CATEGORY.has(normalizeLabel(label))) {
    parts.push(`出し方: ${label}。`)
  }
  const body = rawNote.replace(/\n{3,}/g, "\n\n").trim()
  if (body) parts.push(body)
  return parts.length ? parts.join("\n") : null
}

/** CSV テキスト → 共通パイプラインの生レコード */
export function parseHigashiosakaCsv(csvText: string): RawItem[] {
  return readRows(csvText).map((r) => {
    const categoryId = resolveCategoryId(r.label)
    return {
      name_ja: r.name,
      rows: [
        {
          category_label: r.label,
          note: buildNote(r.label, categoryId, r.note),
          official_link: categoryId
            ? (OFFICIAL_LINK[categoryId] ?? null)
            : null,
        },
      ],
    }
  })
}
