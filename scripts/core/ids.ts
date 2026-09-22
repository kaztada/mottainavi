import type { IdMap } from "../../src/lib/schemas"

/**
 * 品目名に品目IDを割り当てる(data-model.md §11)。
 * - id-map に登録済みの品目名は同じIDを再利用する(公開URLを不変に保つ)
 * - 未登録の品目名だけ next_seq から採番して追記する
 * - 今回の一覧に無い品目名のエントリも消さない(IDの再利用を防ぎ、再登場時に同じIDへ戻す)
 *
 * 入力の idMap は変更せず、更新後の IdMap を返す。
 */
export function assignIds(
  names: string[],
  idMap: IdMap
): { ids: string[]; idMap: IdMap; added: string[] } {
  const seen = new Set<string>()
  for (const n of names) {
    if (seen.has(n)) {
      throw new Error(`品目名が重複しています(IDを一意に振れません): ${n}`)
    }
    seen.add(n)
  }

  const map = { ...idMap.map }
  let next = idMap.next_seq
  const added: string[] = []
  const ids = names.map((name) => {
    const existing = map[name]
    if (existing) return existing
    const id = formatItemId(idMap.prefix, next)
    next += 1
    map[name] = id
    added.push(name)
    return id
  })
  return { ids, idMap: { prefix: idMap.prefix, next_seq: next, map }, added }
}

export function formatItemId(prefix: string, seq: number): string {
  if (seq > 9999) throw new Error(`品目IDの桁あふれ: ${prefix}-${seq}`)
  return `${prefix}-${String(seq).padStart(4, "0")}`
}

/** 空の id-map(新規自治体の初回実行用) */
export function emptyIdMap(prefix: string): IdMap {
  return { prefix, next_seq: 1, map: {} }
}
