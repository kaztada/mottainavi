import { itemNameKey } from "../core/enrich"

/**
 * 品目名の英訳を足す作業(scripts/tools/items-en.ts)で使う純粋関数。
 * ファイルや git には触らない(テスト対象)。手順は .claude/skills/add-item-translations/SKILL.md。
 */

/** 作業ファイル(<slug>.en.tsv)の1行。reason があれば「要確認」で、訳は自治体の辞書に入れる */
export interface WorkRow {
  id: string
  en: string
  reason: string
}

/**
 * 英訳の書き方の検査(data-model.md §25 の決まり3)。問題があれば理由を返す。
 * 文字は ASCII、文頭は大文字か数字、前後や連続の空白なし。
 */
export function englishProblem(en: string): string | null {
  if (en === "") return "英訳が空です"
  if (en !== en.trim()) return "前後に空白があります"
  if (/\s{2,}/.test(en)) return "空白が続いています"
  if (/[^\x20-\x7e]/.test(en)) return "ASCII 以外の文字があります"
  if (!/^[A-Z0-9]/.test(en)) return "文頭が大文字か数字ではありません"
  const open = (en.match(/\(/g) ?? []).length
  const close = (en.match(/\)/g) ?? []).length
  if (open !== close) return "括弧の数が合いません"
  return null
}

/**
 * 作業ファイル(タブ区切り: ID / 英訳 / 要確認の理由)を読む。
 * 空行と # で始まる行は飛ばす。書き方の問題は problems に集める。
 */
export function parseWorkTsv(text: string): {
  rows: WorkRow[]
  problems: string[]
} {
  const rows: WorkRow[] = []
  const problems: string[] = []
  const seen = new Set<string>()
  for (const [n, line] of text.split("\n").entries()) {
    if (line.trim() === "" || line.startsWith("#")) continue
    const [id = "", en = "", reason = ""] = line.split("\t")
    const at = `${n + 1}行目(${id})`
    if (id === "") {
      problems.push(`${at}: ID がありません`)
      continue
    }
    if (seen.has(id)) problems.push(`${at}: ID が重複しています`)
    seen.add(id)
    const problem = englishProblem(en)
    if (problem) problems.push(`${at}: ${problem}`)
    rows.push({ id, en, reason: reason.trim() })
  }
  return { rows, problems }
}

/** 品目名の括弧の前の部分(「植木鉢（陶器製）」→「植木鉢」)。似た品目を探すのに使う */
export function baseName(name: string): string {
  return itemNameKey(name).split("(")[0]
}

/**
 * 似た品目名の既存の訳(訳語をそろえるための参考)。
 * 括弧の前が同じ品目を先に、次に括弧の前がこの品目名を含む・含まれる品目(3文字以上)を返す。
 */
export function similarTranslations(
  name: string,
  dict: Record<string, string>,
  max = 3
): string[] {
  const base = baseName(name)
  const same: string[] = []
  const near: string[] = []
  for (const [key, en] of Object.entries(dict)) {
    if (itemNameKey(key) === itemNameKey(name)) continue
    const other = baseName(key)
    if (other === base) same.push(`${key}=${en}`)
    else if (
      base.length >= 3 &&
      other.length >= 3 &&
      (other.includes(base) || base.includes(other))
    ) {
      near.push(`${key}=${en}`)
    }
  }
  return [...same, ...near].slice(0, max)
}

/** 注意点を文に分ける(「。」と改行・空白の並びで区切る) */
function sentences(note: string): string[] {
  return note
    .split(/(?<=。)|\s{2,}|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 多くの品目に共通する定型文(区分の説明など)。未訳の一覧では省いて、品目ごとの注意点だけ見せる。
 * minCount 件以上の品目に出てくる文を定型文とみなす。
 */
export function boilerplateSentences(
  notes: string[],
  minCount = 15
): Set<string> {
  const counts = new Map<string, number>()
  for (const note of notes) {
    for (const s of new Set(sentences(note))) {
      counts.set(s, (counts.get(s) ?? 0) + 1)
    }
  }
  return new Set(
    [...counts].filter(([, count]) => count >= minCount).map(([s]) => s)
  )
}

/** 定型文を除いた注意点(1行。長いものは切る) */
export function shortNote(
  note: string,
  boilerplate: Set<string>,
  maxLength = 160
): string {
  const text = sentences(note)
    .filter((s) => !boilerplate.has(s))
    .join(" ")
    .replace(/\s+/g, " ")
  return text.length > maxLength ? text.slice(0, maxLength) + "…" : text
}

export interface ReviewRow {
  id: string
  name: string
  category: string
  note: string
  en: string
  reason: string
}

/** Kaz に見てもらう「要確認」の一覧(Markdown) */
export function renderReview(
  municipalityName: string,
  rows: ReviewRow[],
  total: number
): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|")
  const lines = [
    `# ${municipalityName} 品目名の英訳 要確認の一覧`,
    "",
    `今回足した英訳は ${total} 件です。そのうち、品目名だけでは意味が決めきれず、区分や注意点から判断したものが ${rows.length} 件あります。`,
    "",
    "直したいものは「ID → 直したい訳(または気になる点)」の形で返してください。問題なければ「OK」で大丈夫です。",
    "",
    "| ID | 品目名 | 区分 | 注意点 | 英訳 | 迷った点 |",
    "|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${[r.id, r.name, r.category, r.note || "(なし)", r.en, r.reason].map(esc).join(" | ")} |`
    ),
    "",
  ]
  return lines.join("\n")
}
