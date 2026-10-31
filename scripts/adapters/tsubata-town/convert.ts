import { parseCsv } from "../../core/csv"

/**
 * 津幡町「ごみ分別辞典」の CSV(国の標準形式15列)を、共通アダプタの手前で直す。
 * 町の区分と注意点は原文のままで、直すのは次の4つだけ。品目名で明示し、原本が想定と違えば止まる
 * (町がデータを直した・品目を消した可能性があるので、そのまま通さない)。
 *
 * - そり（プラスチック製）: 2区分の区切りがこの1行だけ「・」なので「/」にする
 * - インクカートリッジ: 区分を「販売店へ返却/もえるごみ」にする(Kaz の判断 2026-10-26。町の冊子 令和6年度と
 *   組合の事典 2026-07-09 は もえるごみで、CSV だけが もえないごみ。index.ts の itemNotes で開示する)
 * - ワイシャツ: 注意「50cm以下に切る」を外す(Kaz の判断。冊子にも組合の事典にも無く、直前の「ロープ」の注意が
 *   写ったものと推定)
 * - 「資源ごみ/集団回収」(古紙類の18行): 町の古紙・雑誌類のページ(2024-11-21)は「定期的な古紙類の回収は
 *   行っていない」としているので、電池などの「資源ごみ」と説明を分けるために「資源ごみ（古紙類）/集団回収」にする
 *
 * 料金種別の列は誤りがある(ファンシーケースが「無料」、じゅうたんが「有料」)ので使わない。料金・連絡先の列も使わない。
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
  "連絡先名称",
  "連絡先電話番号",
  "連絡先内線番号",
  "連絡先メールアドレス",
  "連絡先FormURL",
  "連絡先備考",
  "備考",
]

const LABEL_FIXES: Record<string, { from: string; to: string }> = {
  "そり（プラスチック製）": {
    from: "もえるごみ・粗大ごみ",
    to: "もえるごみ/粗大ごみ",
  },
  インクカートリッジ: {
    from: "販売店へ返却/もえないごみ",
    to: "販売店へ返却/もえるごみ",
  },
}

const NOTE_FIXES: Record<string, { from: string; to: string }> = {
  ワイシャツ: { from: "50cm以下に切る", to: "" },
}

const PAPER_LABEL = "資源ごみ/集団回収"
export const PAPER_LABEL_FIXED = "資源ごみ（古紙類）/集団回収"

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text)
  const header = rows[0]?.map((h) => h.trim())
  if (
    !header ||
    header.length !== EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(
      `津幡町CSVの見出しが想定と違います: ${JSON.stringify(header)}`
    )
  }
  const usedLabel = new Set<string>()
  const usedNote = new Set<string>()
  let paperRows = 0
  const lines = [EXPECTED_HEADER.slice(0, 5).map(quote).join(",")]
  rows.slice(1).forEach((r, i) => {
    if (r.every((c) => !c.trim())) return
    if (r.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `津幡町CSVの${i + 2}行目の列数が想定(15列)と違います: ${r.length}列`
      )
    }
    const [code, id, rawName, rawLabel, rawNote] = r
    const name = rawName.trim()
    let label = rawLabel.trim()
    let note = rawNote
    const labelFix = LABEL_FIXES[name]
    if (labelFix) {
      if (label !== labelFix.from) {
        throw new Error(
          `津幡町CSV: ${name} の区分が想定(${labelFix.from})と違います: ${label}`
        )
      }
      label = labelFix.to
      usedLabel.add(name)
    }
    const noteFix = NOTE_FIXES[name]
    if (noteFix) {
      if (note.trim() !== noteFix.from) {
        throw new Error(
          `津幡町CSV: ${name} の注意点が想定(${noteFix.from})と違います: ${note}`
        )
      }
      note = noteFix.to
      usedNote.add(name)
    }
    if (label === PAPER_LABEL) {
      label = PAPER_LABEL_FIXED
      paperRows += 1
    }
    if (label.includes("・")) {
      throw new Error(
        `津幡町CSVの${i + 2}行目: 区分の区切りが「・」の行があります(「/」に直す品目を確かめる): ${name} ${label}`
      )
    }
    lines.push([code, id, name, label, note].map(quote).join(","))
  })
  const unused = [
    ...Object.keys(LABEL_FIXES).filter((n) => !usedLabel.has(n)),
    ...Object.keys(NOTE_FIXES).filter((n) => !usedNote.has(n)),
  ]
  if (unused.length > 0) {
    throw new Error(
      `津幡町CSV: 直す指定の品目が見つかりません(町が品目を変えた可能性): ${unused.join(", ")}`
    )
  }
  if (paperRows === 0) {
    throw new Error(`津幡町CSV: 「${PAPER_LABEL}」の行がありません`)
  }
  return lines.join("\n") + "\n"
}
