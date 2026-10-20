import { parseCsv } from "../../core/csv"
import { normalizeLabel } from "../../core/standard-csv"

/**
 * 八王子市「ゴミの分別方法一覧」(令和7年4月1日版、1,133行)の CSV は国の標準形式に近いが、
 * 3列目に「地方公共団体名」が入り、品目の列名が「ゴミの品目」になっている(列名の接頭辞は無い)。
 * また、品目名のセルの途中に改行が入っているもの(「印鑑\n（象牙製・木製・プラスチック製）」など)がある。
 * 注意点の列は全行が空で、注意書きは「料金備考」「備考」の列にある(index.ts の extraNoteColumns で注意文言に残す)。
 *
 * 分別区分が空の行が49行ある。備考の文言で次の2つに分ける(どちらでもない文言なら止める):
 * - 市では処理できないもの(専門業者・販売店・回収窓口へ、と案内されている29行)
 * - 市に問い合わせが必要なもの(「収集はごみ総合相談センター、持ち込みは戸吹クリーンセンターへお問い合わせください」など20行)
 *
 * 地方公共団体名の列を外し、品目名の改行を取って、標準形式の CSV
 * (全国地方公共団体コード, ID, 品目, 分別区分, 注意点, 料金種別, 料金, 料金備考, 備考)にする。
 */
export const EXPECTED_HEADER = [
  "全国地方公共団体コード",
  "ID",
  "地方公共団体名",
  "ゴミの品目",
  "分別区分",
  "注意点",
  "料金種別",
  "料金",
  "料金備考",
  "備考",
]
const OUT_HEADER = [
  "全国地方公共団体コード",
  "ID",
  "品目",
  "分別区分",
  "注意点",
  "料金種別",
  "料金",
  "料金備考",
  "備考",
]

/** 区分が空の行に付ける区分の表記 */
export const LABEL_SHORI = "市では処理できないもの"
export const LABEL_SOUDAN = "収集・持ち込みは市に問い合わせ"

/** 区分が空の行の備考 → 区分の表記。上から順に当てる */
const EMPTY_LABEL_RULES: readonly [RegExp, string][] = [
  [/^収集はごみ総合相談センター、持ち込みは戸吹クリーンセンターへお問い合わせください/, LABEL_SOUDAN],
  [/^戸吹クリーンセンターへお問い合わせください/, LABEL_SOUDAN],
  [/専門業者が不明な場合は、ごみ総合相談センターへお問い合わせください/, LABEL_SHORI],
  [/消火器リサイクル推進センター/, LABEL_SHORI],
  [/病院・薬局に返却/, LABEL_SHORI],
  [/LPガス協会/, LABEL_SHORI],
  [/^メーカー、販売店へお問い合わせください/, LABEL_SHORI],
]

/** 区分が空の行の区分を、備考の文言から決める(どれにも当たらなければ null) */
export function labelForEmpty(remarks: string): string | null {
  return EMPTY_LABEL_RULES.find(([re]) => re.test(remarks))?.[1] ?? null
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

export function toStandardCsv(
  text: string,
  knownLabels: ReadonlySet<string>
): string {
  const rows = parseCsv(text.replace(/^﻿/, "")).filter((r) =>
    r.some((c) => c.trim())
  )
  const header = rows[0]?.map((h) => h.trim())
  if (
    !header ||
    EXPECTED_HEADER.some((h, i) => header[i] !== h) ||
    header.slice(EXPECTED_HEADER.length).some(Boolean)
  ) {
    throw new Error(`八王子市CSVの見出しが想定と違います: ${JSON.stringify(header)}`)
  }
  const lines = [OUT_HEADER.map(quote).join(",")]
  rows.slice(1).forEach((r, i) => {
    if (r.length !== header.length || r.slice(EXPECTED_HEADER.length).some((c) => c.trim())) {
      throw new Error(
        `八王子市CSVの${i + 2}行目の列が想定と違います(見出しの無い列に値がある、または列数が違う): ${JSON.stringify(r)}`
      )
    }
    const [code, id, , rawName, rawLabel, note, feeType, fee, feeNote, remarks] =
      r.map((c) => c.trim())
    const name = rawName.replace(/\s*\r?\n\s*/g, "")
    let label = rawLabel
    if (!label) {
      const filled = labelForEmpty(remarks)
      if (!filled) {
        throw new Error(
          `八王子市CSVの${i + 2}行目: 分別区分が空で、備考の文言からも区分を決められません(新しい文言の可能性): ${JSON.stringify([name, remarks])}`
        )
      }
      label = filled
    }
    if (!knownLabels.has(normalizeLabel(label))) {
      throw new Error(
        `八王子市CSVの${i + 2}行目: 想定していない分別区分です(区分が増えた可能性): ${JSON.stringify(label)}`
      )
    }
    lines.push(
      [code, id, name, label, note, feeType, fee, feeNote, remarks]
        .map(quote)
        .join(",")
    )
  })
  return lines.join("\n") + "\n"
}
