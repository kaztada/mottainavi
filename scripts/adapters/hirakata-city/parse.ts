import type { RawDispositionRow, RawItem } from "../../core/types"
import {
  CATEGORY_GUIDE,
  COMPOUND_LABELS,
  GUIDE_ALREADY_SAID,
  OFFICIAL_LINK,
  SAME_AS_CATEGORY,
  feeFromLabel,
  normalizeLabel,
  resolveCategoryId,
} from "./category-map"

/** fetchSource が Excel から取り出して渡す1行ぶん(セルの文字列) */
export interface HirakataRow {
  name: string
  note: string
  label: string
}

export const EXPECTED_HEADER = [
  "索引",
  "ごみ品名",
  "かな",
  "排出条件/ルール",
  "収集区分",
]

/** 品目名の2行目が手続きの説明なら、名前ではなく注意文言として扱う */
const PROCEDURE_LINE = /申し込み|申込み|予約センター/

/**
 * 品目名の整形。改行は1行にまとめ、手続きの説明の行は注意文言へ回す。
 * 例: 「網戸\n(アルミ枠、スチール枠、木枠)」→「網戸(アルミ枠、スチール枠、木枠)」
 */
export function splitName(raw: string): {
  name: string
  extraNote: string | null
} {
  const lines = raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const nameLines = lines.filter((l, i) => i === 0 || !PROCEDURE_LINE.test(l))
  const procedure = lines.filter((l, i) => i > 0 && PROCEDURE_LINE.test(l))
  return {
    name: nameLines.join(""),
    extraNote: procedure.length ? procedure.join("\n") : null,
  }
}

/** 捨て方カード1枚ぶんの区分ラベルと、そのカードに残す市の表記(組み合わせ表記のとき) */
export interface LabelPart {
  label: string
  /** 「一般ごみ・粗ごみ」のような組み合わせ表記の原文。1枚目のカードに残す */
  compoundOf: string | null
}

/**
 * 1セルに改行で入った複数の区分ラベルを分ける。
 * 「一般ごみ・粗ごみ」のような組み合わせ表記も区分ごとに分ける。
 */
export function splitLabels(raw: string): LabelPart[] {
  const parts: LabelPart[] = []
  const lines = raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  for (const line of lines) {
    const compound = COMPOUND_LABELS[normalizeLabel(line)]
    if (compound) {
      compound.forEach((label, i) =>
        parts.push({ label, compoundOf: i === 0 ? line : null })
      )
    } else {
      parts.push({ label: line, compoundOf: null })
    }
  }
  return parts
}

/**
 * 捨て方カード1枚ぶんの注意文言を作る(市の文言は変えない)。
 * 先頭に、金額付き区分の手数料・組み合わせ表記の原文・区分の説明・区分名と違う市の表記を置く。
 * 区分の説明は、市の注意点に同じ内容があれば重ねない。
 */
export function buildNote(
  label: string,
  categoryId: string | null,
  body: string | null,
  compoundOf: string | null = null
): string | null {
  const parts: string[] = []
  const text = body?.trim() ?? ""
  const fee = feeFromLabel(label)
  if (fee !== null) parts.push(`処理手数料 ${fee}円(指定品目)。`)
  if (compoundOf) parts.push(`出し方: ${compoundOf}(条件によって分かれます)。`)
  const guide = categoryId ? CATEGORY_GUIDE[categoryId] : undefined
  const alreadySaid = categoryId
    ? (GUIDE_ALREADY_SAID[categoryId]?.test(text) ?? false)
    : false
  if (guide && !alreadySaid) parts.push(guide)
  const norm = normalizeLabel(label).replace(/\d{3,5}円$/, "")
  if (categoryId && !SAME_AS_CATEGORY.has(norm))
    parts.push(`出し方: ${label}。`)
  if (text) parts.push(text)
  return parts.length ? parts.join("\n") : null
}

/** 1行 → 捨て方カードの配列(複数区分のセルはカードを分ける) */
function rowToDispositions(
  row: HirakataRow,
  extraNote: string | null
): RawDispositionRow[] {
  const labels = splitLabels(row.label)
  const body = [extraNote, row.note.trim()].filter(Boolean).join("\n") || null
  return labels.map(({ label, compoundOf }, i) => {
    const categoryId = resolveCategoryId(label)
    // 注意文言(品目ごとの説明)は1枚目のカードに付ける。2枚目以降は区分の説明だけ
    return {
      category_label: label,
      note: buildNote(label, categoryId, i === 0 ? body : null, compoundOf),
      official_link: categoryId ? (OFFICIAL_LINK[categoryId] ?? null) : null,
    }
  })
}

/**
 * 行 → 共通パイプラインの生レコード。
 * 同名の行(条件違い。例: ワックス缶の「中身を除く」「中身が残っている場合」)は1品目にまとめ、
 * 条件ごとに捨て方カードを並べる。
 */
export function rowsToRawItems(rows: HirakataRow[]): RawItem[] {
  const byName = new Map<string, RawItem>()
  for (const row of rows) {
    const { name, extraNote } = splitName(row.name)
    if (!name) continue
    const dispositions = rowToDispositions(row, extraNote)
    const existing = byName.get(name)
    if (existing) existing.rows.push(...dispositions)
    else byName.set(name, { name_ja: name, rows: dispositions })
  }
  return [...byName.values()]
}

/** fetchSource が返す JSON 文字列 → 生レコード */
export function parseHirakataJson(source: string): RawItem[] {
  const rows = JSON.parse(source) as HirakataRow[]
  if (!Array.isArray(rows))
    throw new Error("枚方市データの形式が想定と違います")
  return rowsToRawItems(rows)
}
