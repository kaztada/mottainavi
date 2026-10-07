import { parseCsv } from "../../core/csv"

/**
 * 舞鶴市「ゴミの分別方法一覧」の CSV は、国の標準形式とほぼ同じだが見出しが少し違う
 * (1列目が「レコード番号」、3列目が「ごみの品目」)。
 * 標準形式の見出しに直して、共通アダプタ(core/standard-csv.ts)で読めるようにする。
 */
const SOURCE_HEADER = [
  "レコード番号",
  "ID",
  "ごみの品目",
  "分別区分",
  "注意点",
  "料金種別",
  "料金",
  "料金備考",
  "備考",
]
/** 全国地方公共団体コード(舞鶴市) */
const LG_CODE = "262021"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

/**
 * 市のデータの文字化け(2026-03-30 版)。「ござ（燃える素材）」の注意点の「50cm以上」の「cm」が
 * 置換文字(U+FFFD)+「p」になっている。市のルールブックの表記(1辺の長さが50cm以上)に合わせて、この1か所だけ直す。
 */
const BROKEN_CM = "50�p以上"
const FIXED_CM = "50cm以上"

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()))
  const header = rows[0]?.map((h) => h.trim())
  // 市が列を足したり並べ替えたりしたら気づけるように、見出しが違えば止める
  if (
    !header ||
    header.length !== SOURCE_HEADER.length ||
    SOURCE_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(
      `舞鶴市CSVの見出しが想定と違います: ${JSON.stringify(header)}`
    )
  }
  const lines = [HEADER.map(quote).join(",")]
  rows.slice(1).forEach((r, i) => {
    const line = i + 2
    if (r.length !== SOURCE_HEADER.length) {
      throw new Error(
        `舞鶴市CSVの${line}行目の列数が想定(${SOURCE_HEADER.length}列)と違います: ${JSON.stringify(r)}`
      )
    }
    const [, id, name, label, rawNote, ...rest] = r
    // 料金・備考の列は全行が空(2026-03-30 版)。市が書き込むようになったら、注意文言に足すかを決めるために止める
    if (rest.some((c) => c.trim())) {
      throw new Error(
        `舞鶴市CSVの${line}行目の料金・備考の列に値があります(注意文言に足すか確認する): ${JSON.stringify(r)}`
      )
    }
    const note = rawNote.replace(BROKEN_CM, FIXED_CM)
    if ([id, name, label, note].some((c) => c.includes("�"))) {
      throw new Error(
        `舞鶴市CSVの${line}行目に文字化けがあります: ${JSON.stringify(r)}`
      )
    }
    lines.push([LG_CODE, id, name, label, note].map(quote).join(","))
  })
  return lines.join("\n") + "\n"
}
