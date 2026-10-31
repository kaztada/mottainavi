import { parseCsv } from "../../core/csv"

/**
 * 国立市「ごみの分類一覧」の CSV(デジタル庁の新しい列名の10列+末尾に空の列)を、標準形式の5列にする。
 * 原本の形(2025-03-27): UTF-8(BOM なし)。「注意点」は全行空で、注意は「備考」にある。
 * 「粗大ごみ料金」は粗大ごみ以外の行にも入っていて、「大きいものは粗大ごみで、この料金」の意味。
 * 「料金種別」は表示しない(無料・有料・ごみ袋の別は区分の説明で分かる)。
 *
 * 作り方:
 * - 注意点 = 備考(原文)+ 料金の文 + 料金備考(原文)
 * - 料金の文: 区分「粗大ごみ」の行は「粗大ごみ処理券: 1000円」(計量は10kgにつき500円の表の意味で)。
 *   粗大ごみ以外の行は「粗大ごみになるときの処理券: 500円」で、備考に粗大ごみへの案内があるときだけ。
 *   案内が無いのに料金がある行は、意味が言えないので止まる(市がデータを変えた可能性)
 * - 同じ品目が2回ある70組は1行にまとめる(先頭の「大きさで粗大ごみになる品目」のまとまりと、50音順の部分)。
 *   区分・料金・料金備考が違う組があれば止まる。備考が違うときは、片方がもう片方に含まれるなら長いほうだけ、
 *   そうでなければ両方を残す
 * - 品目名の「（」の前の空白は取る(「パソコン （ディスプレイ含む）」など18品目)
 * - 文字化け1件(物置の「3.3m?」)を、市の令和8年度版カレンダーの索引どおり「3.3㎡」に直す。ほかの置換文字があれば止まる
 * 市が「注意点」の列を埋めたら作り直す必要があるので止まる。
 */
export const EXPECTED_HEADER = [
  "全国地方公共団体コード",
  "ID",
  "地方公共団体名",
  "ゴミの品目",
  "分別区分",
  "注意点",
  "料金種別",
  "粗大ごみ料金",
  "料金備考",
  "備考",
  "",
]
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]
export const SODAI_LABEL = "粗大ごみ"
export const MOJIBAKE_FROM = "3.3m?以下"
export const MOJIBAKE_TO = "3.3㎡以下"

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** 品目名: 前後の空白と、「（」の前の空白を取る */
export function cleanName(name: string): string {
  return name.trim().replace(/[\s　]+（/g, "（")
}

/** 料金の列を読める文にする。文にできないときは null */
export function feeNote(
  label: string,
  fee: string,
  biko: string
): string | null {
  if (!fee) return null
  if (label === SODAI_LABEL) {
    return fee === "計量"
      ? "粗大ごみ処理券: 計量(10kgにつき500円)"
      : `粗大ごみ処理券: ${fee}円`
  }
  if (!/^\d+$/.test(fee) || !biko.includes("粗大ごみ")) return null
  return `粗大ごみになるときの処理券: ${fee}円`
}

interface Row {
  code: string
  id: string
  name: string
  label: string
  fee: string
  feeNote: string
  bikos: string[]
}

/** 同じ品目の備考を足す。片方がもう片方に含まれるなら長いほうだけを残す */
export function addBiko(bikos: string[], biko: string): string[] {
  if (!biko || bikos.some((b) => b.includes(biko))) return bikos
  return [...bikos.filter((b) => !biko.includes(b)), biko]
}

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text)
  const header = rows[0]?.map((h) => h.trim())
  if (
    !header ||
    header.length !== EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(
      `国立市CSVの見出しが想定と違います: ${JSON.stringify(header)}`
    )
  }
  const byName = new Map<string, Row>()
  let mojibake = 0
  rows.slice(1).forEach((raw, i) => {
    const lineNo = i + 2
    if (raw.every((c) => !c.trim())) return
    if (raw.length !== EXPECTED_HEADER.length) {
      throw new Error(`国立市CSVの${lineNo}行目の列数が想定と違います: ${raw.length}列`)
    }
    const [code, id, , rawName, rawLabel, chui, , rawFee, feeBiko, rawBiko, tail] =
      raw.map((c) => c.trim())
    if (chui || tail) {
      throw new Error(
        `国立市CSVの${lineNo}行目: 「注意点」か末尾の列に値が入りました(変換を作り直す): ${rawName}`
      )
    }
    const name = cleanName(rawName)
    if (!name || !rawLabel) {
      throw new Error(`国立市CSVの${lineNo}行目: 品目名か区分が空です`)
    }
    let biko = rawBiko
    if (biko.includes(MOJIBAKE_FROM)) {
      biko = biko.replace(MOJIBAKE_FROM, MOJIBAKE_TO)
      mojibake += 1
    }
    if (/[?？�]/.test(name + rawLabel + biko + feeBiko + rawFee)) {
      throw new Error(`国立市CSVの${lineNo}行目: 文字化けの疑い: ${name} / ${biko}`)
    }
    const existing = byName.get(name)
    if (existing) {
      if (
        existing.label !== rawLabel ||
        existing.fee !== rawFee ||
        existing.feeNote !== feeBiko
      ) {
        throw new Error(
          `国立市CSVの${lineNo}行目: 同じ品目で区分か料金が違います: ${name}`
        )
      }
      existing.bikos = addBiko(existing.bikos, biko)
      return
    }
    byName.set(name, {
      code,
      id,
      name,
      label: rawLabel,
      fee: rawFee,
      feeNote: feeBiko,
      bikos: biko ? [biko] : [],
    })
  })
  if (mojibake !== 1) {
    throw new Error(
      `国立市CSV: 文字化けの直し(${MOJIBAKE_FROM})が1か所でなく${mojibake}か所です(市が直した可能性)`
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  for (const r of byName.values()) {
    const biko = r.bikos.join("\n")
    const fee = feeNote(r.label, r.fee, biko)
    if (r.fee && !fee) {
      throw new Error(
        `国立市CSV: 料金「${r.fee}」の意味が分かりません(粗大ごみ以外で、備考に粗大ごみの案内が無い): ${r.name}`
      )
    }
    const note = [biko, fee, r.feeNote].filter(Boolean).join("\n")
    lines.push([r.code, r.id, r.name, r.label, note].map(quote).join(","))
  }
  return lines.join("\n") + "\n"
}
