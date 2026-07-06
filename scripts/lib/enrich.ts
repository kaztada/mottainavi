import type { CategoryId, ReuseCategoryId } from "../../src/lib/schemas"

// かな変換はアプリの検索正規化と同一ロジックを共用する
export { katakanaToHiragana } from "../../src/lib/search"

/**
 * ポイント欄から粗大ごみ処理手数料を抽出。
 * 例: 「処理手数料 1台400円」「処理手数料:1,000円」 → 400 / 1000
 * 複数記載時は最初の金額(代表額)を採用。
 */
export function extractSodaiFee(note: string | null): number | null {
  if (!note) return null
  // 「処理手数料 1台400円」の「1台」等を読み飛ばし、円の直前の金額を取る
  const m = note.match(/処理手数料[^円]*?([\d,]+)\s*円/)
  if (!m) return null
  const fee = Number(m[1].replace(/,/g, ""))
  return Number.isFinite(fee) && fee > 0 ? fee : null
}

/**
 * reuse_category 付与ヒューリスティック(data-model.md §4)。
 * 上から順に評価し、最初にマッチしたものを返す。
 */
export function inferReuseCategory(
  name: string,
  categoryIds: CategoryId[],
  notes: (string | null)[]
): ReuseCategoryId | null {
  const allNotes = notes.filter(Boolean).join(" ")

  // リターナブル容器(ポイント欄の文言で判定。名前より優先度高)
  if (/リターナブル|購入店・販売店(へ|などに)|販売店へ(の)?返却/.test(allNotes)) {
    return "returnable"
  }
  // 衣類(着るもののみ。ケース・乾燥機・「服用」等の誤検知を除外)
  if (
    /衣類|ウェア|ウエア|服(?!用)|下着|セーター|スーツ|ジャケット|コート|マフラー|着物|浴衣/.test(
      name
    ) &&
    !/ケース|箱|袋|留め具|乾燥機|洗濯|ダンス|タンス|ハンガー|タッパー/.test(name)
  ) {
    return "clothing"
  }
  // 小型家電
  if (
    categoryIds.includes("kogata-kaden") ||
    categoryIds.includes("kogata-kaden-takuhai")
  ) {
    return "small-appliance"
  }
  // おもちゃ・ベビー(家具・本より先に判定: 「ベビーベッド」「絵本」対策)
  if (/おもちゃ|玩具|ベビー|絵本|乳母車|ぬいぐるみ|人形|遊具|滑り台|三輪車/.test(name)) {
    return "toys-baby"
  }
  // 楽器
  if (/ギター|ピアノ|オルガン|楽器/.test(name)) {
    return "instruments"
  }
  // 本・メディア(「本体」「日本酒」「CDケース」等の誤検知を除外)
  if (
    (name === "本" ||
      /書籍|絵本|文庫|単行本|漫画|コミック|雑誌|週刊誌|新書|レコード|ビデオテープ|CD|DVD|ブルーレイ/.test(
        name
      )) &&
    !/ケース|フィルム|プレーヤー|ラジカセ|コンポ|デッキ|ラック|本体|日本/.test(name)
  ) {
    return "books-media"
  }
  // 家具(粗大ごみ かつ 家具らしい名前。コンロ・調理器具は除外)
  if (
    categoryIds.includes("sodai") &&
    /いす|椅子|イス|チェア|棚|机|デスク|テーブル|タンス|たんす|箪笥|チェスト|ベッド|ソファ|ソファー|マットレス|鏡台|ドレッサー|食器棚|本棚|ラック|カラーボックス|靴箱|下駄箱|傘立て/.test(
      name
    ) &&
    !/ガス|コンロ|クッキング|IH/.test(name)
  ) {
    return "furniture"
  }
  return null
}
