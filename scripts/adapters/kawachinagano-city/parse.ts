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

/** 表紙・ページ見出し・ページ番号を除いた本文の行 */
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
      (l) => l && l !== PAGE_TITLE && l !== TABLE_HEADER && !/^\d+$/.test(l)
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

/**
 * 本文の行 → 品目。
 * 区分名のない行は、直前の備考が文の途中(「。」で終わらない)なら備考の続き。
 * そうでなく、次の行が品目行で、その行自身が「。」で終わらなければ、次の品目名の前半とみなす。
 */
export function cutItems(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = []
  let pendingName: string | null = null
  const L = joinWrappedLabels(lines).map(stripIndex)
  for (let i = 0; i < L.length; i++) {
    const line = L[i]
    const hit = findLabel(line)
    if (hit && hit.start > 0) {
      const name = (pendingName ?? "") + line.slice(0, hit.start).trim()
      pendingName = null
      const note = line.slice(hit.end).trim()
      items.push({ name, label: hit.label, noteLines: note ? [note] : [] })
      continue
    }
    const prev = items[items.length - 1]
    const prevOpen =
      prev !== undefined &&
      prev.noteLines.length > 0 &&
      !prev.noteLines[prev.noteLines.length - 1].endsWith("。")
    const nextIsItem = i + 1 < L.length && (findLabel(L[i + 1])?.start ?? 0) > 0
    if (
      pendingName === null &&
      !prevOpen &&
      !line.endsWith("。") &&
      nextIsItem
    ) {
      pendingName = line
    } else if (pendingName !== null) {
      throw new Error(
        `品目名の続きに区分がありません: 「${pendingName}」→「${line}」`
      )
    } else if (prev) {
      prev.noteLines.push(line)
    }
  }
  if (pendingName !== null)
    throw new Error(`末尾に区分のない品目名があります: ${pendingName}`)
  return items
}

/** 備考の行をつなぐ。前の行が文の途中なら改行せず、文が終わっていれば改行する */
export function joinNote(lines: string[]): string {
  let out = ""
  for (const l of lines) {
    if (!out) out = l
    else out += out.endsWith("。") ? `\n${l}` : l
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
