import { parseCsv } from "../../core/csv"
import { normalizeLabel } from "../../core/standard-csv"

/**
 * 鳥取市「鳥取市ごみの分別方法一覧」(鳥取県オープンデータポータル、リソース 9624、データ項目定義書C)の CSV は、
 * 自治体標準オープンデータセットの英語の見出し(localGovernmentCode, identifier, itemName, sortingType, caution, …)。
 * 標準形式の日本語の見出し(全国地方公共団体コード, ID, 品目, 分別区分, 注意点)に直して、共通アダプタで読めるようにする。
 *
 * 2026-09-14 版の書き損じを、名指しで直す(市の Web の「家庭ごみの分別一覧」と照合済み。2026-10-18):
 * - 266行目: 品目名の欄に、直前の「健康器具」の注意書きの2行目が入り、区分が空になっている → 健康器具の注意書きにつなぐ
 * - 「テーブルクロス（木製）」(可燃): 市の Web は「テーブルクロス 布製」(可燃) → 「テーブルクロス（布製）」にする
 * - 区分の表記ゆれ「可　燃」「小型破砕ごみ」 → 「可燃」「小型破砕」
 * - 注意点の全角空白1文字(「　」)・半角空白1文字は空として扱う
 * 同じ種類の崩れ(区分が空の行、品目名の欄に文が入った行)がほかに出てきたら、黙って取り込まずに止める。
 */
export const EXPECTED_HEADER = [
  "localGovernmentCode",
  "identifier",
  "itemName",
  "sortingType",
  "caution",
  "feeType",
  "fee",
  "feeRemarks",
  "contactPointName",
  "contactPointPhoneNumber",
  "contactPointExtension",
  "contactPointEmailAddress",
  "contactPointFormUrl",
  "contactPointRemarks",
  "remarks",
]
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

/** 266行目の、品目名の欄に入っている「健康器具」の注意書きの2行目 */
export const KENKO_CONTINUATION =
  "電池は外して乾電池等に出してください。50cm未満のもので電池が外せないものは有害ごみです。"
const KENKO_NAME = "健康器具"

/** 品目名の取り違え(市の Web は布製・可燃) */
export const WRONG_NAME = "テーブルクロス（木製）"
export const FIXED_NAME = "テーブルクロス（布製）"
const WRONG_NAME_LABEL = "可燃"

/** 区分の表記ゆれ(normalizeLabel 後) → 市のふだんの表記 */
const LABEL_FIX: Record<string, string> = {
  小型破砕ごみ: "小型破砕",
}

/** 区分の表記をそろえる(空白を除き、表記ゆれを直す) */
export function fixLabel(label: string): string {
  const l = normalizeLabel(label)
  return LABEL_FIX[l] ?? l
}

/** 注意点の空白だけのセル(全角空白1文字など)は空にする */
export function fixNote(note: string): string {
  return note.replace(/^[\s　]+|[\s　]+$/g, "")
}

/** 品目名の欄に文が入っているように見えるか(句点で終わる・「ください」を含む) */
function looksLikeSentence(name: string): boolean {
  return /。$|ください/.test(name)
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()))
  const header = rows[0]?.map((h) => h.trim())
  if (
    !header ||
    header.length !== EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(`鳥取市CSVの見出しが想定と違います: ${JSON.stringify(header)}`)
  }
  const out: string[][] = []
  rows.slice(1).forEach((r, i) => {
    const line = i + 2
    if (r.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `鳥取市CSVの${line}行目の列数が想定(${EXPECTED_HEADER.length}列)と違います: ${JSON.stringify(r)}`
      )
    }
    const [code, id, rawName, rawLabel, rawNote, feeType, fee, feeRemarks] = r
    const remarks = r[14]
    // 料金・備考の列は全行が空(2026-09-14 版)。市が書き込むようになったら、注意文言に足すかを決めるために止める
    if ([feeType, fee, feeRemarks, remarks].some((c) => fixNote(c))) {
      throw new Error(
        `鳥取市CSVの${line}行目の料金・備考の列に値があります(注意文言に足すか確認する): ${JSON.stringify(r)}`
      )
    }
    const name = rawName.trim()
    const label = fixLabel(rawLabel)
    const note = fixNote(rawNote)

    // 266行目: 区分が空で、品目名の欄に「健康器具」の注意書きの2行目が入っている
    if (!label) {
      const prev = out[out.length - 1]
      if (name === KENKO_CONTINUATION && !note && prev?.[2] === KENKO_NAME) {
        prev[4] = [prev[4], name].filter(Boolean).join("")
        return
      }
      throw new Error(
        `鳥取市CSVの${line}行目の区分が空です(注意書きの続きが1行の品目になっている可能性。市の分別一覧で確かめる): ${JSON.stringify(r)}`
      )
    }
    if (looksLikeSentence(name)) {
      throw new Error(
        `鳥取市CSVの${line}行目の品目名の欄に文が入っています(市の分別一覧で確かめる): ${JSON.stringify(r)}`
      )
    }

    let fixedName = name
    if (name === WRONG_NAME) {
      if (label !== WRONG_NAME_LABEL) {
        throw new Error(
          `鳥取市CSVの${line}行目: 「${WRONG_NAME}」の区分が想定(${WRONG_NAME_LABEL})と違います。品目名を直してよいか市の分別一覧で確かめる: ${JSON.stringify(r)}`
        )
      }
      fixedName = FIXED_NAME
    }
    out.push([code, id, fixedName, label, note])
  })
  return [HEADER, ...out].map((r) => r.map(quote).join(",")).join("\n") + "\n"
}
