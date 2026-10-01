import type { ItemsDiff } from "./data-check"
import { renderDiff } from "./data-check"

/**
 * データ更新の見張り(scripts/update-data.ts)の判定と報告(純粋関数。テスト対象)。
 */

/** 1自治体の結果 */
export type UpdateOutcome =
  | { slug: string; status: "unwatched" }
  | { slug: string; status: "unchanged" }
  /** 確認だけの実行で、更新を検出した */
  | { slug: string; status: "changed"; before: string; after: string }
  /** 目印を初めて記録した(データは取り直していない) */
  | { slug: string; status: "recorded" }
  /** 取り直したが品目データは同じだった(目印だけ更新) */
  | { slug: string; status: "refreshed" }
  /** 取り直して品目データが変わった */
  | { slug: string; status: "updated"; diff: ItemsDiff; version: string }
  /** 更新を検出したが、自動では作り直せない(人か Claude の対応が必要) */
  | { slug: string; status: "needs-attention"; reason: string }
  /** 掲載ページ・API を確認できなかった */
  | { slug: string; status: "check-failed"; reason: string }

/** 日本時間の今日(YYYY-MM-DD) */
export function todayJst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** 新しい data_version。同じ日に2回目の更新なら末尾に連番を付ける(版番号は必ず変える) */
export function nextDataVersion(current: string, today: string): string {
  const base = today.replace(/-/g, "")
  if (current !== base && !current.startsWith(base + "-")) return base
  const n = current === base ? 1 : Number(current.slice(base.length + 1))
  return `${base}-${n + 1}`
}

/**
 * 品目数の急な増減はパーサの破損を疑う(下限未満、または前回から10%超の増減)。
 * 問題があれば理由を返す。
 */
export function countProblem(
  before: number,
  after: number,
  expectedMin: number
): string | null {
  if (after < expectedMin) {
    return `品目数が下限を下回りました(${after} 件、下限 ${expectedMin} 件)。データの形式が変わった可能性があります`
  }
  if (before > 0 && Math.abs(after - before) / before > 0.1) {
    return `品目数が前回から10%を超えて変わりました(${before} → ${after} 件)。データの形式が変わった可能性があります`
  }
  return null
}

/**
 * 変わる品目のうち、危険物などの語を含むもの(区分・注意文言の変更、追加、削除)。
 * 誤案内が火災などにつながるので、報告の先頭に出して必ず人が見る。
 */
export function hazardLines(diff: ItemsDiff, watchWords: RegExp): string[] {
  const hit = (name: string) => watchWords.test(name.normalize("NFKC"))
  return [
    ...diff.added.filter((i) => hit(i.name_ja)).map((i) => `追加: ${i.name_ja}`),
    ...diff.removed
      .filter((i) => hit(i.name_ja))
      .map((i) => `削除: ${i.name_ja}`),
    ...diff.changed
      .filter((c) => hit(c.name))
      .map((c) => `変更: ${c.name} — ${c.details.join(" / ")}`),
  ]
}

export interface UpdateReport {
  /** PR にする変更があるか(データの更新、または目印の記録・更新) */
  hasChanges: boolean
  /** 人か Claude の対応が必要なものがあるか */
  needsAttention: boolean
  /** PR のタイトル */
  title: string
  /** PR の本文(変更がなければ確認結果の一覧だけ) */
  body: string
  /** Issue の本文(対応が必要なものが無ければ空) */
  attention: string
}

export function renderReport(
  outcomes: UpdateOutcome[],
  watchWords: RegExp,
  today: string
): UpdateReport {
  const of = <S extends UpdateOutcome["status"]>(s: S) =>
    outcomes.filter(
      (o): o is Extract<UpdateOutcome, { status: S }> => o.status === s
    )
  const updated = of("updated")
  const refreshed = of("refreshed")
  const recorded = of("recorded")
  const changed = of("changed")
  const attention = [...of("needs-attention"), ...of("check-failed")]

  const lines: string[] = [`## データ更新の確認(${today})`, ""]
  for (const o of updated) {
    const hazards = hazardLines(o.diff, watchWords)
    lines.push(`### ${o.slug}: データが更新されました(版番号 ${o.version})`, "")
    if (hazards.length > 0) {
      lines.push(
        "**⚠ 電池・スプレー缶など、誤案内が危険につながる品目に変更があります。必ず確認してください。**",
        "",
        ...hazards.map((h) => `- ${h}`),
        ""
      )
    }
    lines.push(renderDiff(o.slug, o.diff).replace(/^### /, "#### "), "")
  }
  if (changed.length > 0) {
    lines.push("### 更新を検出(確認だけの実行のため、作り直していません)", "")
    for (const o of changed) {
      lines.push(`- ${o.slug}`, `  - 前回: ${o.before || "(未記録)"}`, `  - 今回: ${o.after}`)
    }
    lines.push("")
  }
  if (refreshed.length > 0) {
    lines.push(
      `- 取り直したが品目データは同じ(目印だけ更新): ${refreshed.map((o) => o.slug).join(", ")}`
    )
  }
  if (recorded.length > 0) {
    lines.push(
      `- 目印を初めて記録(データは取り直していません): ${recorded.map((o) => o.slug).join(", ")}`
    )
  }
  const unchanged = of("unchanged")
  if (unchanged.length > 0) {
    lines.push(`- 変更なし: ${unchanged.map((o) => o.slug).join(", ")}`)
  }
  const unwatched = of("unwatched")
  if (unwatched.length > 0) {
    lines.push(`- 見張りの対象外: ${unwatched.map((o) => o.slug).join(", ")}`)
  }
  if (attention.length > 0) {
    lines.push("", "### 対応が必要", "", ...attention.map((o) => `- ${o.slug}: ${o.reason}`))
  }

  const attentionBody =
    attention.length === 0
      ? ""
      : [
          `## データ更新: 対応が必要です(${today})`,
          "",
          "週1回の見張りで、自動では作り直せないものが見つかりました。Claude に「データ更新を進めて」と伝えると、手順書(update-municipality-data)に沿って対応します。",
          "",
          ...attention.map(
            (o) =>
              `- **${o.slug}**(${o.status === "check-failed" ? "確認できませんでした" : "更新を検出しました"}): ${o.reason}`
          ),
          "",
        ].join("\n")

  const title =
    updated.length > 0
      ? `data: ${updated.map((o) => o.slug).join("・")} のデータ更新(自動)`
      : "chore: データの取得元の確認記録を更新(自動)"

  return {
    hasChanges: updated.length + refreshed.length + recorded.length > 0,
    needsAttention: attention.length > 0,
    title,
    body: lines.join("\n") + "\n",
    attention: attentionBody,
  }
}
