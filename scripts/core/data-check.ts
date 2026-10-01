import type { Item, ItemsFile } from "../../src/lib/schemas"

/**
 * PR の自動検査(scripts/check-data.ts)で使う比較ロジック。
 * git やファイルには触らない純粋関数だけを置く(テスト対象)。
 */

/** generated_at は実行のたびに変わるので、比較では無視する */
export function contentKey(file: ItemsFile): string {
  // undefined にしたキーは JSON.stringify で落ちる
  return JSON.stringify({ ...file, generated_at: undefined })
}

export function sameContent(a: ItemsFile, b: ItemsFile): boolean {
  return contentKey(a) === contentKey(b)
}

export interface ItemChange {
  id: string
  name: string
  /** 変わった項目ごとの説明(例: 「手放し方: なし → furniture」) */
  details: string[]
}

export interface ItemsDiff {
  added: Item[]
  removed: Item[]
  changed: ItemChange[]
}

const show = (v: string | number | null): string =>
  v === null ? "なし" : String(v)

/** 1品目の変化を、人が読める説明の配列にする(変化がなければ空) */
export function describeItemChange(before: Item, after: Item): string[] {
  const details: string[] = []
  if (before.name_ja !== after.name_ja) {
    details.push(`品目名: ${before.name_ja} → ${after.name_ja}`)
  }
  if (before.reuse_category !== after.reuse_category) {
    details.push(
      `手放し方: ${show(before.reuse_category)} → ${show(after.reuse_category)}`
    )
  }
  const cats = (i: Item) => i.dispositions.map((d) => d.category_id).join(", ")
  if (cats(before) !== cats(after)) {
    details.push(`区分: ${cats(before)} → ${cats(after)}`)
  }
  const notes = (i: Item) => JSON.stringify(i.dispositions.map((d) => d.note_ja))
  if (notes(before) !== notes(after)) details.push("注意文言が変更")
  const links = (i: Item) =>
    JSON.stringify(i.dispositions.map((d) => d.official_link))
  if (links(before) !== links(after)) details.push("公式リンクが変更")
  if (before.sodai_fee_yen !== after.sodai_fee_yen) {
    details.push(
      `粗大ごみ手数料: ${show(before.sodai_fee_yen)} → ${show(after.sodai_fee_yen)}`
    )
  }
  if (JSON.stringify(before.aliases) !== JSON.stringify(after.aliases)) {
    details.push("別名が変更")
  }
  if (
    before.name_kana !== after.name_kana ||
    before.name_romaji !== after.name_romaji
  ) {
    details.push("読みが変更")
  }
  if (before.name_en !== after.name_en) {
    details.push(`英語名: ${show(before.name_en)} → ${show(after.name_en)}`)
  }
  return details
}

/** 品目IDで突き合わせて、追加・削除・変更を出す */
export function diffItems(before: Item[], after: Item[]): ItemsDiff {
  const beforeById = new Map(before.map((i) => [i.id, i]))
  const afterById = new Map(after.map((i) => [i.id, i]))
  const changed: ItemChange[] = []
  for (const a of after) {
    const b = beforeById.get(a.id)
    if (!b) continue
    const details = describeItemChange(b, a)
    if (details.length > 0) changed.push({ id: a.id, name: a.name_ja, details })
  }
  return {
    added: after.filter((i) => !beforeById.has(i.id)),
    removed: before.filter((i) => !afterById.has(i.id)),
    changed,
  }
}

export function isEmptyDiff(d: ItemsDiff): boolean {
  return d.added.length + d.removed.length + d.changed.length === 0
}

/**
 * 版番号の検査: 比較元にもある自治体で品目データの中身が変わったら、data_version も変わっていること。
 * /data/* は1年キャッシュ(immutable)なので、上げ忘れると一度見たブラウザに古いデータが残る。
 */
export function needsVersionBump(input: {
  contentChanged: boolean
  baseVersion: string | null
  headVersion: string
}): boolean {
  if (input.baseVersion === null) return false // 新しい自治体
  return input.contentChanged && input.baseVersion === input.headVersion
}

const MAX_LINES = 60

/** 1自治体ぶんの差分を Markdown にする(長いときは途中で打ち切って件数を示す) */
export function renderDiff(slug: string, d: ItemsDiff): string {
  const lines: string[] = []
  for (const i of d.added) lines.push(`- 追加: ${i.name_ja}(${i.id})`)
  for (const i of d.removed) lines.push(`- 削除: ${i.name_ja}(${i.id})`)
  for (const c of d.changed) {
    lines.push(`- 変更: ${c.name}(${c.id}) — ${c.details.join(" / ")}`)
  }
  const head = `### ${slug}: 追加 ${d.added.length} / 削除 ${d.removed.length} / 変更 ${d.changed.length}`
  const body =
    lines.length > MAX_LINES
      ? [
          ...lines.slice(0, MAX_LINES),
          `- …ほか ${lines.length - MAX_LINES} 件`,
        ]
      : lines
  return [head, "", ...body].join("\n")
}
