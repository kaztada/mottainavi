import { parseCsv } from "../../core/csv"

/**
 * 鳥取県オープンデータポータル「南部町ゴミの分別方法一覧」の CSV(Shift_JIS、791品目)を標準形式の CSV にする。
 * 原本の形(2026年4月時点の版): 見出しは国の標準形式の15列
 * 「全国地方公共団体コード, ID, 品目, 分別区分, 注意点, 料金種別, 料金, 料金備考, 連絡先名称, …, 備考」。
 * ただし中身は列が1つずれている: 「分別区分」(4列目)は全行空で、区分は「注意点」(5列目)に、
 * 注意書きは「料金種別」(6列目)に入っている。ID・料金・料金備考・備考は全行空。
 *
 * 変換: 5列目 → 分別区分、6列目 → 注意点(文字は変えない)。ID は連番。
 * 同じ品目名・同じ区分の行は、そのまま重複している行と、注意書きが空の行(注意書きのある行が別にあるとき)を1つにまとめる
 * (共通アダプタは区分の説明を足したあとで比べるので、まとめないと同じカードが2枚出る)。
 * 「自転車のタイヤ・チューブ」の「ホイル」(「ホイール」の書き損じ)の行だけは、同じ内容の行が別にあるので DROP_ROWS で落とす。
 * ずれ方が想定と違うとき(4列目に値がある、料金・備考の列に値がある)は、町が直した可能性があるので止める。
 */
export const EXPECTED_HEADER = [
  "全国地方公共団体コード",
  "ID",
  "品目",
  "分別区分",
  "注意点",
  "料金種別",
  "料金",
  "料金備考",
]
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]
const WIDTH = 15

/** 書き損じで内容が重複している行(品目名 → 落とす注意書き)。該当の行が無ければ止める(町が直した可能性) */
const DROP_ROWS: Record<string, string> = {
  "自転車のタイヤ・チューブ": "ホイルは不燃粗大ごみです。",
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

export function toStandardCsv(
  text: string,
  dropRows: Record<string, string> = DROP_ROWS
): string {
  const rows = parseCsv(text.replace(/^﻿/, ""))
  const header = rows[0]?.map((h) => h.trim())
  if (
    !header ||
    header.length !== WIDTH ||
    EXPECTED_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(
      `南部町CSVの見出しが想定(標準形式の${WIDTH}列)と違います: ${JSON.stringify(header)}`
    )
  }
  const kept: { code: string; name: string; label: string; note: string }[] = []
  const usedDrops = new Set<string>()
  rows.slice(1).forEach((r, i) => {
    const lineNo = i + 2
    if (r.every((c) => !c.trim())) return
    if (r.length !== WIDTH) {
      throw new Error(
        `南部町CSVの${lineNo}行目の列数が想定(${WIDTH}列)と違います: ${r.length}列`
      )
    }
    const cells = r.map((c) => c.trim())
    const [code, , name, bunbetsu, label, note, ...rest] = cells
    // 分別区分(4列目)は空の前提。値があれば町が列の位置を直した可能性がある
    if (bunbetsu) {
      throw new Error(
        `南部町CSVの${lineNo}行目: 「分別区分」の列に値があります(町が列のずれを直した可能性。変換を見直してください): ${JSON.stringify(r)}`
      )
    }
    // 料金(7列目)・料金備考(8列目)・備考(15列目)は空の前提
    const fee = [cells[6], cells[7], cells[14]]
    if (fee.some(Boolean)) {
      throw new Error(
        `南部町CSVの${lineNo}行目: 料金・料金備考・備考は空の前提ですが、値があります: ${JSON.stringify(r)}`
      )
    }
    if (!name || !label) {
      throw new Error(
        `南部町CSVの${lineNo}行目: 品目か区分(注意点の列)が空です: ${JSON.stringify(r)}`
      )
    }
    void rest
    const body = note.replace(/\r\n?/g, "\n")
    if (dropRows[name] === body) {
      usedDrops.add(name)
      return
    }
    kept.push({ code, name, label, note: body })
  })
  const unused = Object.keys(dropRows).filter((n) => !usedDrops.has(n))
  if (unused.length > 0) {
    throw new Error(
      `南部町CSV: DROP_ROWS の行が見つかりません(町が直した可能性): ${unused.join(", ")}`
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  let id = 0
  const seen = new Set<string>()
  for (const r of kept) {
    const key = `${r.name}\u0000${r.label}\u0000${r.note}`
    if (seen.has(key)) continue // そのまま重複している行
    seen.add(key)
    const hasNoteElsewhere = kept.some(
      (o) => o.name === r.name && o.label === r.label && o.note
    )
    if (!r.note && hasNoteElsewhere) continue // 注意書きが空の行は、あるほうに寄せる
    id += 1
    lines.push([r.code, String(id), r.name, r.label, r.note].map(quote).join(","))
  }
  return lines.join("\n") + "\n"
}
