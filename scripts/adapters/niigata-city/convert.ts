import { parseCsv } from "../../core/csv"
import { normalizeLabel } from "../../core/standard-csv"

/**
 * 新潟市「ごみ分別早見表_R8」の CSV は独自形式(3列: 五十音, 品目名, 分別区分)。
 * 「品目名」のセルは、1行目が品目名、2行目以降が注意書き(改行で区切る)。
 * これを国の標準形式の CSV(全国地方公共団体コード, ID, 品目, 分別区分, 注意点)に直して、共通アダプタで読む。
 *
 * 直すこと: 品目名の誤字2件(キッチンペーバー、マニュキュアのびん)と、行末の空白だけ。
 * 注意書きの文字は原文のまま残す(誤字・冊子のページ参照も書き換えない)。
 * 冊子のページ参照「Ｐ.２５参照」がある注意書きには、アプリでは冊子が手元にないので、原文の後ろに
 * 「※もったいナビ注: 「Ｐ.」は市の冊子「ごみ分別百科事典」のページです。」の1行を足す。
 *
 * 市が形式を変えたときに静かに壊れないよう、見出し・列数・区分の表記(knownLabels)が想定と違えば止める。
 */
export const CITY_CODE = "151009"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

/** 品目名の誤字 [誤り, 直した名前] */
export const NAME_FIXES: readonly [string, string][] = [
  ["キッチンペーバー", "キッチンペーパー"],
  ["マニュキュアのびん", "マニキュアのびん"],
]

/** 冊子のページ参照(全角・半角どちらの数字も) */
const PAGE_REF = /[ＰP][.．][0-9０-９]+参照/
export const BOOKLET = "ごみ分別百科事典"
export const PAGE_REF_NOTE = `※もったいナビ注: 「Ｐ.」は市の冊子「${BOOKLET}」のページです。`

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** 注意書き(原文のまま)。冊子のページ参照があれば、後ろに説明の1行を足す */
export function withPageRefNote(note: string): string {
  return PAGE_REF.test(note) ? `${note}\n${PAGE_REF_NOTE}` : note
}

/** 品目名のセル → [品目名, 注意書き] */
export function splitNameCell(cell: string): [string, string] {
  const lines = cell
    .split(/\r?\n/)
    .map((l) => l.replace(/[\s　]+$/g, "").trim())
    .filter(Boolean)
  const name = lines[0] ?? ""
  const fixedName = NAME_FIXES.find(([from]) => from === name)?.[1] ?? name
  return [fixedName, withPageRefNote(lines.slice(1).join("\n"))]
}

export function toStandardCsv(
  text: string,
  knownLabels: ReadonlySet<string>
): string {
  const rows = parseCsv(text.replace(/^﻿/, "")).filter((r) =>
    r.some((c) => c.trim())
  )
  const header = rows[0]?.map((h) => h.trim())
  if (
    !header ||
    header.length !== 3 ||
    header[0] !== "五十音" ||
    !header[1].startsWith("品目名") ||
    header[2] !== "分別区分"
  ) {
    throw new Error(`新潟市CSVの見出しが想定と違います: ${JSON.stringify(header)}`)
  }
  const lines = [HEADER.map(quote).join(",")]
  rows.slice(1).forEach((r, i) => {
    if (r.length !== 3) {
      throw new Error(
        `新潟市CSVの${i + 2}行目の列数が想定(3列)と違います: ${JSON.stringify(r)}`
      )
    }
    const [name, note] = splitNameCell(r[1])
    const label = r[2].trim()
    if (!name) {
      throw new Error(`新潟市CSVの${i + 2}行目: 品目名が空です: ${JSON.stringify(r)}`)
    }
    if (!knownLabels.has(normalizeLabel(label))) {
      throw new Error(
        `新潟市CSVの${i + 2}行目: 想定していない分別区分です(区分が増えた可能性): ${JSON.stringify(label)}`
      )
    }
    const id = `${CITY_CODE}S${String(i + 1).padStart(5, "0")}`
    lines.push([CITY_CODE, id, name, label, note].map(quote).join(","))
  })
  return lines.join("\n") + "\n"
}
