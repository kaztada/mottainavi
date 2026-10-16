import { parseCsv } from "../../core/csv"
import { normalizeLabel } from "../../core/standard-csv"

/**
 * 世田谷区「ごみ分別一覧」(自治体標準オープンデータセット)の CSV は、見出しは国の標準形式だが、
 * 全行で「品目」の列に分別区分、「分別区分」の列に品目名が入っている(2026-03 版、787行すべて)。
 * また「注意点」の列は空で、注意書きは「備考」の列にある。
 * 列を入れ替えて戻し、備考を注意点にして、標準形式の CSV(全国地方公共団体コード, ID, 品目, 分別区分, 注意点)にする。
 *
 * 区が列を直したときに静かに壊れないよう、「品目」の列の値が区分の表記(knownLabels)でなければ止める。
 * 1セル2区分の区切りは「または」にそろえる(1件だけ「もしくは」がある)。
 */
export const HEADER_PREFIX = "ごみの分別方法_"
export const EXPECTED_HEADER = [
  "全国地方公共団体コード",
  "ID",
  "品目",
  "分別区分",
  "注意点",
  "料金種別",
  "料金",
  "料金備考",
  "備考",
].map((h) => HEADER_PREFIX + h)
export const LABEL_SEPARATOR = "または"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** 区の区分の表記を、区切り「または」にそろえる */
export function normalizeSeparator(label: string): string {
  return label.replace(/もしくは/g, LABEL_SEPARATOR)
}

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
    header.length !== EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(
      `世田谷区CSVの見出しが想定と違います: ${JSON.stringify(header)}`
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  rows.slice(1).forEach((r, i) => {
    if (r.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `世田谷区CSVの${i + 2}行目の列数が想定(${EXPECTED_HEADER.length}列)と違います: ${JSON.stringify(r)}`
      )
    }
    const [code, id, labelCol, nameCol, noteCol, , , , remarks] = r.map((c) =>
      c.trim()
    )
    // 入れ替わっている前提の検査: 「品目」の列が区分の表記で、「分別区分」の列はそうでないこと
    const label = normalizeSeparator(labelCol)
    const parts = label.split(LABEL_SEPARATOR).map((l) => normalizeLabel(l))
    if (
      parts.some((p) => !knownLabels.has(p)) ||
      knownLabels.has(normalizeLabel(nameCol))
    ) {
      throw new Error(
        `世田谷区CSVの${i + 2}行目: 「品目」と「分別区分」の列が入れ替わっている前提と合いません(区が列を直した可能性): ${JSON.stringify([labelCol, nameCol])}`
      )
    }
    // 注意点の列は空だが、入っていれば備考の前に置く(注意文言を欠落させない)
    const note = [noteCol, remarks].filter(Boolean).join("\n")
    lines.push([code, id, nameCol, label, note].map(quote).join(","))
  })
  return lines.join("\n") + "\n"
}
