/**
 * 配信データ(public/data/<slug>/)の置き場所と形式(tech-stack.md §10)。
 * ビルドスクリプト(scripts/build-public-data.ts)とアプリの両方がここを参照する。
 */
import type { Item, ItemShard, SearchIndexItem } from "./schemas"

/**
 * 配信元のベースURL。将来データを外部ストレージ(Blob/R2等)へ移すときはここだけ変える。
 * 同一オリジンの静的配信(public/data)のときは相対パス。
 */
export const DATA_BASE_URL = "/data"

/** 詳細データのシャード数(大阪市で1本あたり約33品目・gzip 5〜6KB) */
export const SHARD_COUNT = 32

/** 品目ID(例: osk-0123)の連番からシャード番号を決める */
export function shardOf(itemId: string): number {
  const m = itemId.match(/-(\d{4})$/)
  if (!m) throw new Error(`品目IDの形式が不正: ${itemId}`)
  return Number(m[1]) % SHARD_COUNT
}

export function shardFileName(shard: number): string {
  return `${String(shard).padStart(2, "0")}.json`
}

/** 検索インデックスのURL。version はキャッシュバスター(municipality.json の data_version) */
export function searchIndexUrl(slug: string, version: string): string {
  return `${DATA_BASE_URL}/${slug}/search.json?v=${encodeURIComponent(version)}`
}

/** 品目を含むシャードのURL */
export function itemShardUrl(slug: string, itemId: string, version: string): string {
  return `${DATA_BASE_URL}/${slug}/items/${shardFileName(shardOf(itemId))}?v=${encodeURIComponent(version)}`
}

/** 全国レジストリ(自治体選択UI用)のURL */
export function registryUrl(version: string): string {
  return `${DATA_BASE_URL}/municipalities.json?v=${encodeURIComponent(version)}`
}

/** 品目 → 検索インデックス(キー名を1文字にしてサイズを抑える) */
export function toSearchIndex(items: Item[]): SearchIndexItem[] {
  return items.map((i) => ({
    id: i.id,
    n: i.name_ja,
    k: i.name_kana,
    a: i.aliases,
    e: i.name_en,
    c: [...new Set(i.dispositions.map((d) => d.category_id))],
    f: i.sodai_fee_yen,
    r: i.reuse_category,
  }))
}

/** 品目 → シャード配列(添字=シャード番号) */
export function toShards(items: Item[]): ItemShard[] {
  const shards: ItemShard[] = Array.from({ length: SHARD_COUNT }, () => ({}))
  for (const item of items) shards[shardOf(item.id)][item.id] = item
  return shards
}
