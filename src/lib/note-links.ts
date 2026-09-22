/**
 * 注意文言の中の生URLを、リンク部分とそれ以外に分ける。
 * URL に使える ASCII 文字だけを拾い、直後の全角かっこ・句読点(「…html））。」など)は URL に含めない。
 * 末尾の「.」「,」などの ASCII 句読点も文の区切りとみなして外す。
 */
const URL_RE = /(https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'*+,;=%]+)/g
const TRAILING_PUNCT = /[.,;:!?]+$/

export type NotePart = { type: "text" | "link"; value: string }

export function splitNoteLinks(text: string): NotePart[] {
  const parts: NotePart[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0
    let url = m[0]
    const trail = url.match(TRAILING_PUNCT)?.[0] ?? ""
    if (trail) url = url.slice(0, -trail.length)
    if (start > last)
      parts.push({ type: "text", value: text.slice(last, start) })
    parts.push({ type: "link", value: url })
    last = start + url.length
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) })
  return parts
}
