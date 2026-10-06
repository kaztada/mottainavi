import type { RawItem } from "../../core/types"
import {
  CATEGORY_GUIDE,
  CATEGORY_LABELS,
  EMPTY_NOTE_FALLBACK,
  KEEP_LABEL,
  OFFICIAL_LINK,
  resolveCategoryId,
} from "./category-map"

const PAGE_TITLE = "☆家庭用ごみの分別辞典☆"
const TABLE_HEADER = "品名 分別の種類 備考（注意事項）"

/** 区分名が「前後に空白(または行頭・行末)」で現れる位置を探す。注意書き中の「…もえるごみで出す」は対象外 */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
const LABEL_RE = new RegExp(
  `(^|\\s)(${CATEGORY_LABELS.map(escapeRe).join("|")})(?=\\s|$)`
)

export interface ParsedItem {
  name: string
  label: string
  noteLines: string[]
}

/** 表紙・ページ見出し・ページ番号・単独の行になった50音見出し(「こ」)を除いた本文の行 */
export function bodyLines(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const start = lines.indexOf(TABLE_HEADER)
  if (start < 0)
    throw new Error(
      "河内長野市の分別辞典の見出し行が見つかりません(PDFの形式が変わった可能性)"
    )
  return lines
    .slice(start)
    .filter(
      (l) =>
        l &&
        l !== PAGE_TITLE &&
        l !== TABLE_HEADER &&
        !/^\d+$/.test(l) &&
        !/^[ぁ-ん]$/.test(l)
    )
}

/** 折り返した区分名(「資源ごみ（…」の閉じかっこなし、「通常の収集（…）」+「では回収できません」)を次の行とつなぐ */
export function joinWrappedLabels(lines: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i]
    const next = lines[i + 1]
    if (next !== undefined && /資源ごみ（[^）]*$/.test(l)) {
      l += next
      i++
    } else if (
      next !== undefined &&
      l.endsWith("通常の収集（集積所からの収集）") &&
      next.startsWith("では回収できません")
    ) {
      l += next
      i++
    }
    out.push(l)
  }
  return out
}

/** 行頭の50音見出し(「い 石 回収できません」の「い」)を外す */
export function stripIndex(line: string): string {
  const m = line.match(/^[ぁ-ん]\s+(.+)$/)
  return m ? m[1] : line
}

function findLabel(
  line: string
): { label: string; start: number; end: number } | null {
  const m = LABEL_RE.exec(line)
  if (!m) return null
  const start = m.index + m[1].length
  return { label: m[2], start, end: start + m[2].length }
}

/** 品目名の前半にはならない行(備考の補足のかっこ書き・URL・丸数字の箇条書き) */
const NOTE_ONLY_RE = /^(?:[（(]|https?:\/\/|[①-⑳])/
const URL_RE = /^https?:\/\/\S+$/

/** 備考の行がそこで終わっているか(「。」で終わる、または URL だけの行) */
function isClosed(line: string): boolean {
  return line.endsWith("。") || URL_RE.test(line)
}

/** 区分名だけの行の前に置ける、折り返した品目名の行数の上限 */
const MAX_NAME_LINES = 3

/**
 * 本文の行 → 品目。
 * 区分名のない行は、直前の備考が文の途中(「。」でも URL でも終わらない)なら備考の続き。
 * かっこ書き・URL・丸数字で始まる行も備考の続き(品目名の前半にしない)。
 * そうでなく、その行自身が「。」で終わらなければ、次のどちらかのとき品目名の前半とみなす:
 * - 次の行が品目行(品名の後半 + 区分名)
 * - 区分名のない行が MAX_NAME_LINES 行以内で続き、その次が区分名で始まる行(品名が折り返し、区分名が独立した行にある)
 */
export function cutItems(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = []
  let pending: string[] = []
  /** あと何行を品目名として読むか(先読みで決めた行数) */
  let nameLinesLeft = 0
  const L = joinWrappedLabels(lines).map(stripIndex)
  const canStartName = (l: string) => !l.endsWith("。") && !NOTE_ONLY_RE.test(l)
  /** i 行目から始まる品目名の行数。品目名でなければ 0 */
  const nameRun = (i: number): number => {
    for (let n = 0; n < MAX_NAME_LINES && i + n < L.length; n++) {
      if (!canStartName(L[i + n])) return 0
      const next = i + n + 1 < L.length ? findLabel(L[i + n + 1]) : null
      if (!next) continue
      // 品名の後半 + 区分名の行が続くのは、前半が1行のときだけ(従来の規則)
      if (next.start > 0) return n === 0 ? 1 : 0
      return n + 1
    }
    return 0
  }
  for (let i = 0; i < L.length; i++) {
    const line = L[i]
    const hit = findLabel(line)
    if (hit) {
      if (hit.start === 0 && pending.length === 0)
        throw new Error(`区分名で始まる行の前に品目名がありません: 「${line}」`)
      const name = pending.join("") + line.slice(0, hit.start).trim()
      pending = []
      nameLinesLeft = 0
      const note = line.slice(hit.end).trim()
      items.push({ name, label: hit.label, noteLines: note ? [note] : [] })
      continue
    }
    if (nameLinesLeft > 0) {
      pending.push(line)
      nameLinesLeft--
      continue
    }
    const prev = items[items.length - 1]
    const prevOpen =
      prev !== undefined &&
      prev.noteLines.length > 0 &&
      !isClosed(prev.noteLines[prev.noteLines.length - 1])
    const run = prevOpen ? 0 : nameRun(i)
    if (run > 0) {
      pending.push(line)
      nameLinesLeft = run - 1
    } else if (prev) {
      // 「品名 区分 備考」の形のまま備考に入るのは、区分名一覧に無い区分の疑い
      if (/\S\s+\S/.test(line))
        throw new Error(
          `備考の行に空白があります(未知の区分名の疑い): 「${line}」`
        )
      prev.noteLines.push(line)
    }
  }
  if (pending.length > 0)
    throw new Error(`末尾に区分のない品目名があります: ${pending.join("")}`)
  for (const it of items) {
    // かっこの開きと閉じの数が合わない品目名は、折り返した品名の片方が欠けている
    const opens = (it.name.match(/[（(]/g) ?? []).length
    const closes = (it.name.match(/[）)]/g) ?? []).length
    if (!it.name || opens !== closes || /^[（(）)]|^https?:|。/.test(it.name))
      throw new Error(
        `品目名に備考が混ざっている疑いがあります: 「${it.name}」(${it.label})`
      )
  }
  return items
}

/** 備考の行をつなぐ。前の行が文の途中なら改行せず、文が終わっていれば(「。」または URL)改行する */
export function joinNote(lines: string[]): string {
  let out = ""
  let last = ""
  for (const l of lines) {
    if (!out) out = l
    else out += isClosed(last) || URL_RE.test(l) ? `\n${l}` : l
    last = l
  }
  return out
}

export function buildNote(
  label: string,
  categoryId: string | null,
  body: string
): string | null {
  const parts: string[] = []
  if (categoryId && CATEGORY_GUIDE[categoryId])
    parts.push(CATEGORY_GUIDE[categoryId])
  if (categoryId && KEEP_LABEL.has(categoryId)) parts.push(`出し方: ${label}。`)
  if (body.trim()) parts.push(body.trim())
  else if (categoryId && EMPTY_NOTE_FALLBACK[categoryId])
    parts.push(EMPTY_NOTE_FALLBACK[categoryId])
  return parts.length ? parts.join("\n") : null
}

/** PDF のテキスト → 共通パイプラインの生レコード */
export function parseKawachinaganoText(text: string): RawItem[] {
  return cutItems(bodyLines(text)).map((it) => {
    const categoryId = resolveCategoryId(it.label)
    return {
      name_ja: it.name,
      rows: [
        {
          category_label: it.label,
          note: buildNote(it.label, categoryId, joinNote(it.noteLines)),
          official_link: categoryId
            ? (OFFICIAL_LINK[categoryId] ?? null)
            : null,
        },
      ],
    }
  })
}
