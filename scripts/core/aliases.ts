/**
 * 品目に付ける別名の決め方(別名辞書 → 品目ごとの aliases)。
 *
 * 辞書(data/aliases.common.json + 市の aliases.json)は「語 → 別名の一覧」。
 * 以前は品目名に語が含まれていれば位置を問わず付けていたため、付属品や別の物
 * (キーボード(パソコン用)に PC、ベッドカバーに bed、テレビ台にブラウン管テレビ)にも付き、
 * 下位の種類(電気ストーブ)に「石油ストーブ」のような兄弟の別名まで付いていた(2026-10-20 の調査)。
 * 今は次のときだけ付ける(docs/data-model.md §2.5)。
 *
 *  1. 品目名(注記を除いた各部分)が語と一致 → 語の別名を全部付ける。
 *     注記に「以外」「除く」「不可」があるとき、1文字の語(油・本・靴・鏡)で注記があるときは
 *     注記を外した一致を使わない(油（食用以外）・靴（スキー靴）・鏡（手鏡）に食用油・スニーカー・姿見を付けない)
 *  2. 品目名の各部分が語で終わる(下位の種類。ノートパソコン・ベビーベッド。かなはそろえず比べる)
 *     → 語を含まない別名だけ付ける(PC・laptop・bed は付くが、ノートパソコンは付かない)。
 *     ただし品目名自身が含む別名なら付ける(電子オルガン・電子ピアノに電子ピアノ)
 *  3. 語のあとに TAIL_ALLOW の言葉が続く(タブレット端末・DVDディスク)→ 2 と同じ
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
  DVD: ["ディスク", "ソフト"],
  CD: ["ディスク", "ソフト"],
  ゲーム機: ["器"],
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
const SEPARATORS = /[・、，,／/＆&]+/
/**
 * 「ライター－金属製」「空きびん－化粧品用」「空き缶　飲料用」のハイフンや空白は、前の語に素材や用途を
 * 付ける区切り。区切った区間ごとに、「・」「、」の区切りと「〜の〜」「〜用」の判定をする
 */
const SEGMENT = /[-–—―\s]+/

function normalize(s: string): string {
  return s.normalize("NFKC").toLowerCase()
}

/**
 * 語で終わっていても別の物なので別名を付けない品目名の終わり(遮断リスト)。キーは辞書の語。
 * 全31市の「語で終わる品目名」を全部見て選んだ(座布団は布団ではなく、エアロバイクはバイクではない)。
 * 自転車用補助いす・シューズドライヤー・サマーベッド・チューブベッド・ウッドカーペットは入間市の追加のときに足した(2026-10-25)
 * テープライターは恵庭市の追加のときに足した(2026-11-01)
 */
export const TAIL_BLOCK: Readonly<Record<string, readonly string[]>> = {
  いす: ["車いす", "自転車用子供イス", "自転車用補助いす"],
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
    "テープライター",
  ],
  キャリーバッグ: ["ラタンキャリーバッグ"],
  ダンボール: [
    "プラスチックダンボール",
    "油引きダンボール",
    "ろう引きダンボール",
  ],
  段ボール: ["プラスチック製段ボール", "プラスチック段ボール"],
  ドライヤー: ["ペット用ドライヤー", "シューズドライヤー"],
  ベッド: ["サマーベッド", "チューブベッド"],
  カーペット: ["ウッドカーペット"],
  アイロン: ["ヘアアイロン", "ヘアーアイロン"],
  // 恵庭市の辞書の語「電池」。「乾電池、電池の外装フィルム」に battery を付けない(乾電池には共通の語「乾電池」から付く)
  電池: ["乾電池"],
  蛍光灯: ["LED蛍光灯"],
  蛍光管: ["LED蛍光管"],
}

/**
 * 下位の種類(語で終わる品目名)には付けない別名。語を含まなくても、兄弟を指す別名
 * (エレキギターにアコギ)
 */
export const TAIL_DROP: Readonly<Record<string, readonly string[]>> = {
  ギター: ["アコギ"],
}

/**
 * 下位の種類が互いに別の区分になりやすい語(ストーブは石油・ガス・電気、電球は LED・蛍光灯・白熱)。
 * 注記が1つの限定(「ストーブ（電気）」)の品目には、兄弟の別名(石油ストーブ・LED電球)を付けない。
 * ほかの語(ギターの木製・パソコンの本体)は限定が素材や用途なので、総称の品目に兄弟の別名を付ける
 */
export const STRICT_SIBLINGS: ReadonlySet<string> = new Set([
  "ストーブ",
  "電球",
])

/** 品目名が語と一致するときだけ付け、語で終わる品目(ワインクーラー)には付けない語 */
export const EXACT_ONLY: ReadonlySet<string> = new Set(["クーラー", "ふとん"])

/**
 * 語の前に付く言葉が決まっている語(許可リスト)。ポットは苗ポット・フラワーポット・オイルポットなどが
 * 多いので、電気ポットや湯沸かしポットのように前の言葉が合うときだけ付ける
 */
export const TAIL_PREFIX: Readonly<Record<string, readonly string[]>> = {
  ポット: ["電気", "湯沸し", "湯沸かし", "ジャー", "保温", "魔法"],
}

/** 品目名を、注記を外した各部分(正規化済み)と、外した注記に分けたもの */
export interface NameInfo {
  /** 注記を外して区切った各部分(語で終わるかの判定に使う) */
  parts: string[]
  /** parts のうち、語との一致の判定に使う部分(「自転車・バイクのアクセサリー」の自転車は除く) */
  exact: string[]
  /** 外した注記 */
  notes: string
  /** カッコの中身を区切った各部分(「椅子（いす）」「バッグ（かばん）」の同義語の判定に使う) */
  inner: string[]
}

export function analyzeName(name: string): NameInfo {
  let rest = normalize(name)
  let notes = ""
  const inner: string[] = []
  // ※ 以降は注記
  const note = rest.indexOf("※")
  if (note >= 0) {
    notes += rest.slice(note)
    rest = rest.slice(0, note)
  }
  for (;;) {
    const next = rest.replace(BRACKETS, (m) => {
      notes += m
      inner.push(...m.slice(1, -1).split(SEPARATORS))
      return ""
    })
    if (next === rest) break
    rest = next
  }
  const segments = rest
    .split(SEGMENT)
    .map((seg) => seg.split(SEPARATORS).filter((p) => p.length > 0))
    .filter((seg) => seg.length > 0)
  return {
    parts: segments.flat(),
    exact: segments.flatMap(eligibleParts),
    notes,
    inner: inner.map((p) => p.trim()).filter((p) => p.length > 0),
  }
}

/** 注記を外して区切った品目名の各部分(正規化済み) */
export function splitName(name: string): string[] {
  return analyzeName(name).parts
}

/**
 * 「自転車・バイクのアクセサリー」のように、最後の部分が「〜の〜」「〜用」の複合語のときは、
 * 前の部分(自転車)は最後の部分(アクセサリー)にかかる言葉なので、最後の部分だけを見る。
 * 最後の部分が機器(プレーヤー・ドライブ・レコーダー・デッキ)のときも同じ
 */
function eligibleParts(parts: string[]): string[] {
  if (parts.length < 2) return parts
  const last = parts[parts.length - 1]
  // 「DVD・ブルーレイディスクプレーヤー」の DVD は、プレーヤーにかかる言葉(媒体ではない)
  return /の|用$|(プレーヤー?|プレイヤー?|ドライブ|レコーダー?|デッキ)$/.test(
    last
  )
    ? [last]
    : parts
}

/** 照合用の正規化(検索と同じ: かな・長音・全半角をそろえる) */
const cmp = normalizeForSearch

function undecorated(part: string): string {
  const stripped = part.replace(DECORATION, "")
  return stripped.length > 0 ? stripped : part
}

/** 限定の文に「〜以外」「〜を除く」「〜不可」があるか(ストーブ（石油ストーブを除く）) */
const NEGATION = /以外|除く|除き|を除|ではな|でな|のぞ|不可|できな|なし/

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
  const info = analyzeName(name)
  const parts = info.parts
  // 1文字の語(油・本・靴・鏡)は注記で別の物になりやすい(靴（スキー靴）・鏡（手鏡）)ので、
  // 注記のない品目名(「本類」のように末尾の言葉だけ外したものは可)のときだけ一致とみなす
  const wholeExact = cmp(undecorated(normalize(name).trim()))
  // ストーブ・電球(STRICT_SIBLINGS)で注記や空白のあとに限定を書いた品目(「ストーブ（電気）」
  // 「ストーブ　電気・ガス」)には、限定にその種類の言葉(石油。灯油も同じ)がある兄弟の別名だけ付ける
  // (「ストーブ（石油）」に石油ストーブ。「ストーブ（石油を除く）」には付けない)
  const trimmed = normalize(name).trim()
  const spaceAt = trimmed.search(/\s/)
  const qualText = (
    info.notes + (spaceAt >= 0 ? trimmed.slice(spaceAt) : "")
  ).replace(/灯油/g, "石油")
  const exactParts = new Set<string>()
  for (const p of info.exact) {
    exactParts.add(cmp(p))
    exactParts.add(cmp(undecorated(p)))
  }
  const innerParts = new Set(info.inner.map((p) => cmp(undecorated(p))))
  // 語で終わるかは、かなをそろえず(NFKC・小文字だけ)で見る。そろえると「スパイス」が「いす」で終わる
  const tailParts = [...new Set(parts.map((p) => undecorated(p)))]
  const ownNames = parts.map(cmp)

  for (const [key, vals] of Object.entries(dict)) {
    const k = cmp(key)
    if (k.length === 0) continue
    // 1: 一致
    // 「椅子（いす）」「バッグ（かばん）」のように、カッコの中の語の別名が外の部分のときは同義語なので一致とみなす
    const synonym =
      k.length >= 2 &&
      innerParts.has(k) &&
      vals.some((v) => info.exact.some((p) => cmp(undecorated(p)) === cmp(v)))
    if (k.length < 2 ? wholeExact === k : exactParts.has(k) || synonym) {
      for (const v of vals) {
        const nv = cmp(v)
        if (
          qualText.length > 0 &&
          STRICT_SIBLINGS.has(key) &&
          wholeExact !== k &&
          nv !== k &&
          nv.includes(k)
        ) {
          // 兄弟の別名は、限定にその種類の言葉があり、否定されていないときだけ
          const kind = nv.replace(k, "")
          if (!cmp(qualText).includes(kind) || NEGATION.test(qualText)) continue
        }
        out.add(v)
      }
      continue
    }
    if (k.length < 2 || EXACT_ONLY.has(key)) continue
    // 2・3: 語で終わる/語+許可の言葉(遮断リスト・前の言葉の指定を除く)
    const kr = normalize(key)
    const allow = (TAIL_ALLOW[key] ?? []).map(normalize)
    const block = (TAIL_BLOCK[key] ?? []).map(normalize)
    const prefix = (TAIL_PREFIX[key] ?? []).map((x) => normalize(x) + kr)
    const isTail = tailParts.some(
      (p) =>
        !block.some((b) => p.endsWith(b)) &&
        (prefix.length > 0
          ? prefix.some((x) => p.endsWith(x))
          : (p.endsWith(kr) && p !== kr) ||
            allow.some((a) => p.endsWith(kr + a)))
    )
    if (!isTail) continue
    const drop = TAIL_DROP[key] ?? []
    for (const v of vals) {
      if (drop.includes(v)) continue
      // 語を含む別名(石油ストーブ)は兄弟なので付けない。ただし品目名自身が含む別名なら付ける
      // (電子ピアノに電子ピアノ。付けないと並び順で語そのもの(ピアノ)の品目が先頭に出る)
      const nv = cmp(v)
      const inOwnName = ownNames.some((o) => o.includes(nv))
      if (!nv.includes(k) || inOwnName) out.add(v)
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
