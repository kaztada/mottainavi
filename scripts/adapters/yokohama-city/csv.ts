/**
 * RFC 4180 相当の小さな CSV パーサ(引用符内の改行・二重引用符・CRLF に対応)。
 * 横浜市の CSV は「出し方のポイント」欄に引用符付きの複数行セルがあるため、単純な行分割では壊れる。
 * パッケージを増やさないためにここで持つ。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  const src = text.startsWith("﻿") ? text.slice(1) : text

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\r") {
      // CRLF の CR は無視(LF で行を閉じる)
    } else if (ch === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += ch
    }
  }
  if (inQuotes) throw new Error("CSV: 引用符が閉じていません")
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}
