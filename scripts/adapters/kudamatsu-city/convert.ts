import { parseCsv } from "../../core/csv"

/**
 * 下松市「【下松市】ゴミの分別方法一覧」の CSV は国の標準形式(接頭辞「ゴミの分別方法_」の9列)。
 * 変換で変えるのは1か所だけ: 羽毛製品の2行は「分別区分」の欄に回収の案内の文が入っているので、
 * 区分を「羽毛製品の回収」に読み替え、元の文は注意点へ原文のまま移す。
 * 読み替えは品目名で明示し、指定の品目が無い・別の品目に同じ文があるときは止める(市がデータを直した可能性)。
 * 品目名も区分も空の2行(kdgc00100496・00100497)は共通アダプタの readRows が落とす。
 */
export const HEADER = [
  "全国地方公共団体コード",
  "ID",
  "品目",
  "分別区分",
  "注意点",
  "料金種別",
  "料金",
  "料金備考",
  "備考",
].map((c) => `ゴミの分別方法_${c}`)

export const UMOU_LABEL = "羽毛製品の回収"
export const UMOU_ITEMS = ["ジャケットダウン（５０％以上）", "布団（ダウン５０％以上）"]
/** 分別区分の欄の文の書き出し(全文は注意点に残す) */
const UMOU_SENTENCE = /UMOUプロジェクト/

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text)
  const header = rows[0]?.map((h) => h.trim())
  // 市が列を足したり並べ替えたりしたら気づけるように、見出しが違えば止める
  if (
    !header ||
    header.length !== HEADER.length ||
    HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(`下松市CSVの見出しが想定と違います: ${JSON.stringify(header)}`)
  }
  const found = new Set<string>()
  const lines = [HEADER.map(quote).join(",")]
  for (const r of rows.slice(1)) {
    const cells = [...r]
    if (UMOU_SENTENCE.test(cells[3] ?? "")) {
      const name = (cells[2] ?? "").trim()
      if (!UMOU_ITEMS.includes(name)) {
        throw new Error(`下松市CSV: 想定していない品目の区分の欄に回収の案内の文があります: ${name}`)
      }
      if ((cells[4] ?? "").trim()) {
        throw new Error(`下松市CSV: 羽毛製品の行の注意点が空ではありません(元の文の置き場所を確かめる): ${name}`)
      }
      found.add(name)
      cells[4] = cells[3].trim()
      cells[3] = UMOU_LABEL
    }
    lines.push(cells.map(quote).join(","))
  }
  const missing = UMOU_ITEMS.filter((n) => !found.has(n))
  if (missing.length > 0) {
    throw new Error(`下松市CSV: 読み替えの品目が見つかりません(市がデータを直した可能性): ${missing.join(", ")}`)
  }
  return lines.join("\n") + "\n"
}
