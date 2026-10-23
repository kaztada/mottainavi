/**
 * 品目に付ける別名の決め方(別名辞書 → 品目ごとの aliases)。
 *
 * 辞書(data/aliases.common.json + 市の aliases.json)は「語 → 別名の一覧」。
 * 以前は品目名に語が含まれていれば位置を問わず付けていたため、付属品や別の物
 * (キーボード(パソコン用)に PC、ベッドカバーに bed、テレビ台にブラウン管テレビ)にも付き、
 * 下位の種類(電気ストーブ)に「石油ストーブ」のような兄弟の別名まで付いていた(2026-10-20 の調査)。
 * 今は次のときだけ付ける(docs/data-model.md §2.5)。
 *
 *  1. 品目名(注記を除いた各部分)が語と一致 → 語の別名を全部付ける
 *  2. 品目名の各部分が語で終わる(下位の種類。ノートパソコン・ベビーベッド)
 *     → 語を含まない別名だけ付ける(PC・laptop・bed は付くが、ノートパソコンは付かない)
 *  3. 語のあとに TAIL_ALLOW の言葉が続く(タブレット端末・DVDプレーヤー)→ 2 と同じ
 *
 * カッコの中身(キーボード(パソコン用)の「パソコン用」)は用途や補足の説明なので見ない。
 */

import { normalizeForSearch } from "../../src/lib/search"

/** 語のあとに続いても「同じ物」とみなす言葉(許可リスト)。キーは辞書の語 */
export const TAIL_ALLOW: Readonly<Record<string, readonly string[]>> = {
  タブレット: [
    "端末",
    "PC",
    "コンピューター",
    "コンピュータ",
    "型コンピューター",
    "型コンピュータ",
    "型端末",
    "型PC",
  ],
  スマートフォン: ["端末"],
  携帯電話: ["端末"],
  DVD: [
    "プレーヤー",
    "プレイヤー",
    "プレーヤ",
    "デッキ",
    "レコーダー",
    "レコーダ",
    "ディスク",
  ],
  CD: ["プレーヤー", "プレイヤー", "プレーヤ", "デッキ", "ディスク"],
  新聞: ["紙"],
  蛍光灯: ["管"],
  段ボール: ["箱"],
  ダンボール: ["箱"],
}

/** 品目名の終わりについていても意味を変えない言葉(「類」「本体」など)。語の判定の前に外す */
const DECORATION = /(類|等|など|一式|全般|本体|[0-9]+)$/

/** 注記として外すカッコ */
const BRACKETS =
  /[（(【\[［<＜〈〔][^（()）【】\[\]［］<>＜＞〈〉〔〕]*[）)】\]］>＞〉〕]/g
const SEPARATORS = /[・、，,／/＆&\s\-–—―]+/

function normalize(s: string): string {
  return s.normalize("NFKC").toLowerCase()
}

/**
 * 語で終わっていても別の物なので別名を付けない品目名の終わり(遮断リスト)。キーは辞書の語。
 * 全31市の「語で終わる品目名」を全部見て選んだ(座布団は布団ではなく、エアロバイクはバイクではない)
 */
export const TAIL_BLOCK: Readonly<Record<string, readonly string[]>> = {
  いす: ["車いす", "自転車用子供イス"],
  布団: ["座布団"],
  自転車: ["原動機付自転車"],
  時計: ["砂時計", "オイル時計"],
  バイク: ["エアロバイク", "キックバイク", "水上バイク"],
  ゲーム機: [
    "アーケードゲーム機",
    "ゲームセンター用ゲーム機",
    "テーブルゲーム機",
  ],
  ライター: [
    "タイプライター",
    "ラベルライター",
    "チェックライター",
    "DVDライター",
  ],
  紙パック: ["掃除機の紙パック"],
  ダンボール: [
    "プラスチックダンボール",
    "油引きダンボール",
    "ろう引きダンボール",
  ],
  段ボール: ["プラスチック製段ボール", "プラスチック段ボール"],
  ドライヤー: ["ペット用ドライヤー"],
  アイロン: ["ヘアアイロン", "ヘアーアイロン"],
  蛍光灯: ["LED蛍光灯"],
  蛍光管: ["LED蛍光管"],
}

/**
 * 語の前に付く言葉が決まっている語(許可リスト)。ポットは苗ポット・フラワーポット・オイルポットなどが
 * 多いので、電気ポットや湯沸かしポットのように前の言葉が合うときだけ付ける
 */
export const TAIL_PREFIX: Readonly<Record<string, readonly string[]>> = {
  ポット: ["電気", "湯沸し", "湯沸かし", "ジャー", "保温", "魔法"],
}

/** 注記(カッコ・※以降)を外して区切った品目名の各部分(正規化済み) */
export function splitName(name: string): string[] {
  let rest = normalize(name)
  // ※ 以降は注記
  const note = rest.indexOf("※")
  if (note >= 0) rest = rest.slice(0, note)
  for (;;) {
    const next = rest.replace(BRACKETS, "")
    if (next === rest) break
    rest = next
  }
  return rest.split(SEPARATORS).filter((p) => p.length > 0)
}

/**
 * 「自転車・バイクのアクセサリー」のように、最後の部分が「〜の〜」「〜用」の複合語のときは、
 * 前の部分(自転車)は最後の部分(アクセサリー)にかかる言葉なので、最後の部分だけを見る
 */
function eligibleParts(parts: string[]): string[] {
  if (parts.length < 2) return parts
  const last = parts[parts.length - 1]
  return /[のを]|用$/.test(last) ? [last] : parts
}

/** 照合用の正規化(検索と同じ: かな・長音・全半角をそろえる) */
const cmp = normalizeForSearch

function undecorated(part: string): string {
  const stripped = part.replace(DECORATION, "")
  return stripped.length > 0 ? stripped : part
}

/**
 * 品目名に付ける別名(重複なし)。
 * @param name 品目名(name_ja)
 * @param dict 共通辞書に市の辞書を重ねたもの
 */
export function buildItemAliases(
  name: string,
  dict: Readonly<Record<string, readonly string[]>>
): string[] {
  const out = new Set<string>(dict[name] ?? [])
  const parts = eligibleParts(splitName(name))
  const exactParts = new Set<string>()
  for (const p of parts) {
    exactParts.add(cmp(p))
    exactParts.add(cmp(undecorated(p)))
  }
  const tailParts = [...new Set(parts.map((p) => cmp(undecorated(p))))]

  for (const [key, vals] of Object.entries(dict)) {
    const k = cmp(key)
    if (k.length === 0) continue
    // 1: 一致
    if (exactParts.has(k)) {
      for (const v of vals) out.add(v)
      continue
    }
    if (k.length < 2) continue
    // 2・3: 語で終わる/語+許可の言葉(遮断リスト・前の言葉の指定を除く)
    const allow = TAIL_ALLOW[key] ?? []
    const block = (TAIL_BLOCK[key] ?? []).map(cmp)
    const prefix = (TAIL_PREFIX[key] ?? []).map((x) => cmp(x) + k)
    const isTail = tailParts.some(
      (p) =>
        !block.some((b) => p.endsWith(b)) &&
        (prefix.length > 0
          ? prefix.some((x) => p.endsWith(x))
          : p.endsWith(k) || allow.some((a) => p.endsWith(k + cmp(a))))
    )
    if (!isTail) continue
    for (const v of vals) {
      if (!cmp(v).includes(k)) out.add(v)
    }
  }
  return [...out]
}

/** 以前の付け方(品目名に語が含まれれば付ける)。影響の比較用で、データ作成では使わない */
export function legacyItemAliases(
  name: string,
  dict: Readonly<Record<string, readonly string[]>>
): string[] {
  const out = new Set<string>(dict[name] ?? [])
  for (const [key, vals] of Object.entries(dict)) {
    if (key.length >= 2 && key !== name && name.includes(key)) {
      for (const v of vals) out.add(v)
    }
  }
  return [...out]
}
