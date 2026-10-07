/**
 * 自治体選択(S0)のデフォルメ日本地図(screens.md §9)。
 * 都道府県を同じ大きさのタイルにして、日本列島のおおよその並びに置く。
 * 実際の形の地図だと東京・大阪・香川などが小さすぎて指で押せないため。
 */
export interface PrefTile {
  /** 都道府県名(レジストリの pref と同じ表記) */
  pref: string
  /** タイルに出す短い名前(都・府・県を外したもの。北海道はそのまま) */
  label: string
  /** 英語の名前(Prefecture などは付けない) */
  en: string
  /** 英語モードのタイルに出す行。長い名前は読みの切れ目で2行に分ける(1行は5文字まで) */
  enLines: string[]
  /** 列(西 → 東、0 始まり) */
  col: number
  /** 行(北 → 南、0 始まり) */
  row: number
  /** タイルの大きさ(マス数)。北海道だけ 2 */
  span: number
}

export const TILE_COLS = 13
export const TILE_ROWS = 13

function shortName(pref: string): string {
  return pref === "北海道" ? pref : pref.replace(/[都府県]$/, "")
}

/**
 * 英語の名前。タイルは小さいので、6文字以上の名前は読みの切れ目(/)で2行に分ける。
 * Gunma は5文字だが、幅の広い字(m)でスマホ幅のタイルからはみ出すので、2行にする。
 * 北海道は2マス角なので分けない。
 */
const EN_NAMES: Record<string, string> = {
  北海道: "Hokkaido",
  青森県: "Ao/mori",
  岩手県: "Iwate",
  宮城県: "Miya/gi",
  秋田県: "Akita",
  山形県: "Yama/gata",
  福島県: "Fuku/shima",
  茨城県: "Iba/raki",
  栃木県: "Tochi/gi",
  群馬県: "Gun/ma",
  埼玉県: "Sai/tama",
  千葉県: "Chiba",
  東京都: "Tokyo",
  神奈川県: "Kana/gawa",
  新潟県: "Nii/gata",
  富山県: "To/yama",
  石川県: "Ishi/kawa",
  福井県: "Fukui",
  山梨県: "Yama/nashi",
  長野県: "Naga/no",
  岐阜県: "Gifu",
  静岡県: "Shizu/oka",
  愛知県: "Aichi",
  三重県: "Mie",
  滋賀県: "Shiga",
  京都府: "Kyoto",
  大阪府: "Osaka",
  兵庫県: "Hyogo",
  奈良県: "Nara",
  和歌山県: "Waka/yama",
  鳥取県: "Tot/tori",
  島根県: "Shi/mane",
  岡山県: "Oka/yama",
  広島県: "Hiro/shima",
  山口県: "Yama/guchi",
  徳島県: "Toku/shima",
  香川県: "Kaga/wa",
  愛媛県: "Ehime",
  高知県: "Kochi",
  福岡県: "Fuku/oka",
  佐賀県: "Saga",
  長崎県: "Naga/saki",
  熊本県: "Kuma/moto",
  大分県: "Oita",
  宮崎県: "Miya/zaki",
  鹿児島県: "Kago/shima",
  沖縄県: "Oki/nawa",
}

/** 都道府県名 → 英語の名前(一覧に無い名前はそのまま返す) */
export function prefNameEn(pref: string): string {
  return (EN_NAMES[pref] ?? pref).replace("/", "")
}

const LAYOUT: [pref: string, col: number, row: number, span?: number][] = [
  ["北海道", 11, 0, 2],
  ["青森県", 12, 2],
  ["秋田県", 11, 3],
  ["岩手県", 12, 3],
  ["山形県", 11, 4],
  ["宮城県", 12, 4],
  ["石川県", 8, 5],
  ["富山県", 9, 5],
  ["新潟県", 10, 5],
  ["福島県", 11, 5],
  ["福井県", 8, 6],
  ["岐阜県", 9, 6],
  ["長野県", 10, 6],
  ["群馬県", 11, 6],
  ["栃木県", 12, 6],
  ["島根県", 4, 7],
  ["鳥取県", 5, 7],
  ["京都府", 7, 7],
  ["滋賀県", 8, 7],
  ["愛知県", 9, 7],
  ["山梨県", 10, 7],
  ["埼玉県", 11, 7],
  ["茨城県", 12, 7],
  ["山口県", 3, 8],
  ["広島県", 4, 8],
  ["岡山県", 5, 8],
  ["兵庫県", 6, 8],
  ["大阪府", 7, 8],
  ["奈良県", 8, 8],
  ["三重県", 9, 8],
  ["静岡県", 10, 8],
  ["東京都", 11, 8],
  ["千葉県", 12, 8],
  ["長崎県", 0, 9],
  ["佐賀県", 1, 9],
  ["福岡県", 2, 9],
  ["和歌山県", 8, 9],
  ["神奈川県", 11, 9],
  ["熊本県", 1, 10],
  ["大分県", 2, 10],
  ["愛媛県", 4, 10],
  ["香川県", 5, 10],
  ["鹿児島県", 1, 11],
  ["宮崎県", 2, 11],
  ["高知県", 4, 11],
  ["徳島県", 5, 11],
  ["沖縄県", 0, 12],
]

export const PREF_TILES: PrefTile[] = LAYOUT.map(
  ([pref, col, row, span = 1]) => ({
    pref,
    label: shortName(pref),
    en: prefNameEn(pref),
    enLines: (EN_NAMES[pref] ?? pref).split("/"),
    col,
    row,
    span,
  })
)
