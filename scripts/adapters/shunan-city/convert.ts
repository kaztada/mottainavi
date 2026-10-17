import { parseCsv } from "../../core/csv"

/**
 * 周南市「【周南市】ゴミの分別方法一覧」の CSV は国の標準形式(15列)。
 * 注意点の1行(パソコン 自作パソコン)に、電話番号のリンクの HTML タグ(<a href="tel:…">…</a>)が入っている。
 * タグを外して電話番号の文字だけを残す(アプリは電話番号を自動でリンクにしない)。
 * ほかの種類のタグが入ったら、読める文に直す方法を決めるために止める。
 */
const HEADER = [
  "全国地方公共団体コード",
  "ID",
  "品目",
  "分別区分",
  "注意点",
  "料金種別",
  "料金",
  "料金備考",
  "連絡先名称",
  "連絡先電話番号",
  "連絡先内線番号",
  "連絡先メールアドレス",
  "連絡先FormURL",
  "連絡先備考",
  "備考",
]

const TEL_LINK = /<a href="tel:[0-9-]+">([0-9-]+)<\/a>/g

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** 注意点の電話番号のリンクのタグを外す。ほかのタグが残れば止める */
export function stripTelLinks(note: string): string {
  const text = note.replace(TEL_LINK, "$1")
  if (/<[a-zA-Z/]/.test(text)) {
    throw new Error(`周南市CSVの注意点に、想定していない HTML タグがあります: ${note}`)
  }
  return text
}

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text.replace(/^﻿/, "")).filter((r) =>
    r.some((c) => c.trim())
  )
  const header = rows[0]?.map((h) => h.trim())
  // 市が列を足したり並べ替えたりしたら気づけるように、見出しが違えば止める
  if (
    !header ||
    header.length !== HEADER.length ||
    HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(`周南市CSVの見出しが想定と違います: ${JSON.stringify(header)}`)
  }
  const lines = [HEADER.map(quote).join(",")]
  for (const r of rows.slice(1)) {
    const cells = [...r]
    cells[4] = stripTelLinks(cells[4] ?? "")
    lines.push(cells.map(quote).join(","))
  }
  return lines.join("\n") + "\n"
}
