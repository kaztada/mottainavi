import { parseCsv } from "../../core/csv"
import { normalizeLabel } from "../../core/standard-csv"

/**
 * 広島市「広島市_家庭ごみ分別50音事典」(広島広域都市圏・広島県オープンデータポータルサイト)の CSV
 * (Shift_JIS。共通アダプタが UTF-8 に直したもの)は、独自の5列(50音, 品目, 分別区分, 排出方法, 備考)。
 * 見出しに全角空白が入り(「品　　　目」など)、セルの中に改行がある。料金の列は無い。
 * 標準形式(全国地方公共団体コード, ID, 品目, 分別区分, 注意点)に直して、共通アダプタで読めるようにする。
 *
 * 直すこと(2026-04-01 修正版。市の Web の「家庭ごみ分別50音事典」と照合済み。2026-10-18):
 * - 品目名のセルの中の改行(紙面の折り返し)は詰める。「かみそりの刃⏎カッターナイフの刃」だけは2品目の並びなので「・」でつなぐ
 * - 「アンテナ（テレビ用）（衛生放送用）」の書き間違い → 「衛星放送用」(市の Web は「衛星放送用」)
 * - 注意点の文字は直さない(市の注意点は原文のまま。はかりの2品目の「じゅうぶなポリ袋」も原文どおり)
 * - 区分「家電ﾘｻｲｸﾙ法⏎対象機器」(半角カナ・改行) → 「家電リサイクル法対象機器」
 * - 区分「―」(排出方法はすべて「市では収集しません」) → 「市では収集しないごみ」(市の「家庭ごみの正しい出し方」の見出し)
 * - 区分の欄が「品目「○○」に掲載しています。」の参照だけの行(2026-04 版で4行) → 参照先の品目(○○、または○○（…）)の
 *   区分と出し方をそのまま写す。参照先が複数(素材ごとなど)あれば、品目のカードを参照先ごとに分ける。参照先が無ければ止める
 * - 排出方法・備考のセルの中の改行は、紙面の折り返し(句点や閉じかっこの後ろ・「※」「①」などの前でないもの)だけ詰める
 * 排出方法と備考は、両方とも注意点に残す(排出方法、続けて備考)。
 * 50音の列は使わない(空の行が1件ある: 本棚(本箱))。
 */
export const EXPECTED_HEADER = ["50音", "品目", "分別区分", "排出方法", "備考"]
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]
/** 全国地方公共団体コード(広島市) */
const LG_CODE = "341002"

/** 改行で2つの品目名が並んでいるセル(紙面では2行)。「・」でつなぐ */
const NAME_JOIN_WITH_DOT = new Set(["かみそりの刃\nカッターナイフの刃"])
/** 品目名の書き間違い(市の Web の表記に合わせる) */
const NAME_FIX: Record<string, string> = {
  "アンテナ（テレビ用）（衛生放送用）": "アンテナ（テレビ用）（衛星放送用）",
}
/** 排出方法の書き間違い */

/** 区分の表記(normalizeLabel 後) → 取り込むときの表記 */
const LABEL_FIX: Record<string, string> = {
  家電リサイクル法対象機器: "家電リサイクル法対象機器",
  "―": "市では収集しないごみ",
}

/** 参照だけの行の区分の欄(「品目「かばん」に掲載しています。」) */
const REFERENCE = /^品目「(.+)」に掲載しています。$/

/** 品目名のセルの改行を詰め、前後の空白を除く */
export function fixName(raw: string): string {
  const cell = raw.replace(/\r/g, "").trim()
  const joined = NAME_JOIN_WITH_DOT.has(cell)
    ? cell.replace(/\n/g, "・")
    : cell.replace(/[ \t　]*\n[ \t　]*/g, "")
  const name = joined.replace(/^[\s　]+|[\s　]+$/g, "")
  return NAME_FIX[name] ?? name
}

/**
 * 排出方法・備考のセルの改行を整える。紙面の折り返し(文の途中の改行)は詰め、
 * 句点・閉じかっこ・閉じかぎかっこの後ろ、「※」「①②③」「(」「（」の前の改行と、空行(段落の区切り)は残す(空行は1つの改行にする)。
 */
export function fixNote(raw: string): string {
  let s = raw.replace(/\r/g, "").replace(/[ \t　]+\n/g, "\n").replace(/\n[ \t　]+/g, "\n")
  // 空行(段落の区切り)は1つの改行として残す
  s = s.replace(/\n{2,}/g, "\u0000")
  s = s.replace(/([^。）)｣」\u0000])\n(?![※①②③④⑤(（\u0000])/g, "$1")
  s = s.replace(/\u0000/g, "\n")
  return s.trim()
}

/** 区分の表記を整える(参照だけの行はそのまま返す) */
export function fixLabel(raw: string): string {
  const l = normalizeLabel(raw)
  return LABEL_FIX[l] ?? l
}

interface Row {
  name: string
  label: string
  note: string
}

/** 参照先の品目名か(名前が同じ、または名前の後ろに素材などの「（」「(」が続く) */
function isReferenceTarget(name: string, ref: string): boolean {
  return (
    name === ref ||
    ((name.startsWith(ref + "（") || name.startsWith(ref + "(")) && name.length > ref.length)
  )
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()))
  const header = rows[0]?.map((h) => normalizeLabel(h))
  if (
    !header ||
    header.length !== EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(`広島市CSVの見出しが想定と違います: ${JSON.stringify(rows[0])}`)
  }
  const items: Row[] = []
  const references: { line: number; name: string; ref: string }[] = []
  rows.slice(1).forEach((r, i) => {
    const line = i + 2
    if (r.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `広島市CSVの${line}行目の列数が想定(${EXPECTED_HEADER.length}列)と違います: ${JSON.stringify(r)}`
      )
    }
    const [, rawName, rawLabel, method, remarks] = r
    const name = fixName(rawName)
    if (!name) {
      throw new Error(`広島市CSVの${line}行目の品目名が空です: ${JSON.stringify(r)}`)
    }
    const label = fixLabel(rawLabel)
    const ref = label.match(REFERENCE)?.[1]
    if (ref) {
      // 参照だけの行は、排出方法・備考が空のはず(入っていたら、写し方を決め直すために止める)
      if (method.trim() || remarks.trim()) {
        throw new Error(
          `広島市CSVの${line}行目: 参照だけの行に排出方法・備考があります: ${JSON.stringify(r)}`
        )
      }
      references.push({ line, name, ref })
      return
    }
    if (!label) {
      throw new Error(`広島市CSVの${line}行目の分別区分が空です: ${JSON.stringify(r)}`)
    }
    const note = [fixNote(method), fixNote(remarks)].filter(Boolean).join("\n")
    items.push({ name, label, note })
  })

  // 参照だけの行: 参照先の品目の区分と出し方を写す(参照先ごとにカードを分ける)
  const out: Row[] = [...items]
  for (const { line, name, ref } of references) {
    const targets = items.filter((it) => isReferenceTarget(it.name, ref))
    if (targets.length === 0) {
      throw new Error(
        `広島市CSVの${line}行目: 参照先の品目「${ref}」が見つかりません(「${name}」の区分を決められない)`
      )
    }
    for (const t of targets) {
      const lead = `※もったいナビ注: 市の50音事典では、この品目は品目「${ref}」の案内を見るよう書かれています。このカードは「${t.name}」の案内です。`
      out.push({ name, label: t.label, note: [lead, t.note].filter(Boolean).join("\n") })
    }
  }

  const lines = [HEADER.map(quote).join(",")]
  for (const r of out) lines.push([LG_CODE, "", r.name, r.label, r.note].map(quote).join(","))
  return lines.join("\n") + "\n"
}
