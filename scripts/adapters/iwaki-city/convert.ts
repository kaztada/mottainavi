import { parseCsv } from "../../core/csv"

/**
 * いわき市「ごみ分別一覧表」の CSV は、見出し「№, 品　名, 分別区分, 注　意　点」と名前のない空の列4つ(全部空)。
 * 国の標準形式と同じ列の並びに直して、共通アダプタ(core/standard-csv.ts)で読めるようにする。
 * - 区分は略称(燃やす・家電・金属・容プラ・× など)なので、市の冊子「家庭ごみの分け方・出し方(ハンドブック)」
 *   令和8年版の正式名に直す(LABELS)。知らない表記が来たら止める
 * - 注意点は原文のまま残し、略称・窓口向けの語(「家電・金属」「×」「規格」「業」「要聞き取り」など)があるときだけ、
 *   その語の説明を原文の後ろに「※もったいナビ注: …」の1行で足す(glossFor)。内部向けのメモ2つだけ外す(INTERNAL_MEMOS)
 * - 前提の検査: 見出し、列数(空の列に何か入ったら止める)、番号(1〜行数。重複は既知の 322 だけ)
 */
export const SOURCE_HEADER = ["№", "品名", "分別区分", "注意点", "", "", "", ""]
/** 全国地方公共団体コード(いわき市) */
const LG_CODE = "072044"
const HEADER = ["全国地方公共団体コード", "ID", "品目", "分別区分", "注意点"]

/**
 * 市の区分の略称 → 冊子の正式名(冊子 P5〜6「いわき市の『家庭ごみ』の分別」と各区分のページ)。
 * 古紙類は冊子 P14 の5種類(新聞紙・雑誌・段ボール・紙パック・その他の紙)
 */
export const LABELS: Record<string, string> = {
  燃やす: "燃やすごみ",
  燃やさない: "燃やさないごみ",
  "家電・金属": "小型家電・金属類",
  容プラ: "容器包装プラスチック",
  製品プラ: "製品プラスチック",
  びん: "びん類",
  "かん・ペット": "かん類・ペットボトル",
  電池: "電池類",
  "紙―新聞": "古紙類（新聞紙）",
  "紙―雑誌": "古紙類（雑誌）",
  "紙―ダン": "古紙類（段ボール）",
  "紙―パック": "古紙類（紙パック）",
  "紙―その他": "古紙類（その他の紙）",
  // 1件だけ長音(ー)で書かれている(2026-04-01 版の「紙袋（商店や書店で商品をいれたもの）」の前後)
  "紙ーその他": "古紙類（その他の紙）",
  大型: "大型ごみ",
  "×": "市では収集しないもの",
}

/** 番号の重複として知っているもの(2026-04-01 版: 322 が2行、323 が無い。「紙やすり」が 321 で後ろにずれている) */
const KNOWN_DUPLICATE_NUMBERS = new Set(["322"])

/** 市の資源循環推進課(冊子 P7・データの掲載ページ) */
export const SHIGEN_TEL = "市の資源循環推進課(0246-22-7559)"

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`
/** 見出しの「品　名」のように、字の間に入っている空白を除く */
const squeeze = (s: string) => s.replace(/[\s　]+/g, "")

/**
 * 市の内部向けのメモ(安全に関係しない)。この2つの文言だけを注意文言に出さない。
 * 2026-04-01 版の CSV にそれぞれ1回だけある(テストで確かめる)。ほかの文言は消さない
 */
export const INTERNAL_MEMOS = [
  // ウォーターサーバー(市の施設の係が処分先に確かめた、という記録)
  "（清管施設係から処分業者に処分可能と確認済み）",
  // 劇薬(過去の問い合わせの記録)
  "　※過去にヒ素の問い合わせあり",
]

const ASK = `判断に迷うときは${SHIGEN_TEL}にお問い合わせください`

/**
 * 市の注意点に出てくる略称・窓口向けの語の説明。注意点にその語があるときだけ、説明を集めて
 * 原文の後ろに「※もったいナビ注: …」の1行を足す(原文は変えない)。
 */
export const GLOSSES: [RegExp, string][] = [
  [/家電[・･]金属(?!類)/, "「家電・金属」は小型家電・金属類のこと"],
  [/容プラ/, "「容プラ」は容器包装プラスチックのこと"],
  [/製品プラ(?!スチック)|製プラ/, "「製品プラ」「製プラ」は製品プラスチックのこと"],
  [/[「『｢]電池[」』｣]/, "「電池」は電池類のこと"],
  [/[「『｢]燃やす[」』｣]/, "「燃やす」は燃やすごみのこと"],
  [/[「『｢]燃やさない[」』｣]/, "「燃やさない」は燃やさないごみのこと"],
  [/かん・ペット/, "「かん・ペット」はかん類・ペットボトルのこと"],
  [/紙[－―ー-]その他/, "「紙－その他」は古紙類(その他の紙)のこと"],
  [/[×✕]/, "「×」は市では収集しないもののこと"],
  [
    /「規格」|規格未満/,
    "「規格」は集積所に出せる大きさ(長さ60cm未満かつ重さ10kg未満)のこと",
  ],
  [
    /「業」|(?<![事産工企作職営農専])業(?=で|に|以外|及び)/,
    "「業」は仕事・事業(で使ったもの)のこと",
  ],
  [/要聞き取り/, `「要聞き取り」とある品目は、${ASK}`],
  [
    /材質を聴き取りして対応すること/,
    `材質がわからないときは${SHIGEN_TEL}にお問い合わせください`,
  ],
  [/を案内|利用案内|ボックス案内/, "「〜を案内」「〜案内」は、その回収先やお店・業者を利用できる、という意味"],
  [
    /^[\s　]*マーク確認/,
    "(推定)原文の「マーク確認」の前には、もとはマークの画像があったと考えられます。PETマーク(ペットボトルの識別表示)のことと思われます",
  ],
  [
    /^[\s　]*がついているもの/,
    "(推定)原文の文頭には、もとはマークの画像があったと考えられます。紙マーク(紙製容器包装の識別表示)のことと思われます",
  ],
]

/** 注意点に出てくる語の説明(1行)。該当が無ければ null */
export function glossFor(note: string): string | null {
  const parts = GLOSSES.filter(([re]) => re.test(note)).map(([, text]) => text)
  return parts.length ? `※もったいナビ注: ${parts.join("。")}。` : null
}

export function toStandardCsv(text: string): string {
  const rows = parseCsv(text.replace(/^﻿/, "")).filter((r) =>
    r.some((c) => c.trim())
  )
  const header = rows[0]?.map(squeeze)
  // 市が列を足したり並べ替えたりしたら気づけるように、見出しが違えば止める
  if (
    !header ||
    header.length !== SOURCE_HEADER.length ||
    SOURCE_HEADER.some((h, i) => header[i] !== h)
  ) {
    throw new Error(
      `いわき市CSVの見出しが想定と違います: ${JSON.stringify(rows[0])}`
    )
  }
  const body = rows.slice(1)
  const lines = [HEADER.map(quote).join(",")]
  const seen = new Set<string>()
  let maxNo = 0
  body.forEach((r, i) => {
    const line = i + 2
    if (r.length !== SOURCE_HEADER.length || r.slice(4).some((c) => c.trim())) {
      throw new Error(
        `いわき市CSVの${line}行目の列が想定(4列+空の列4つ)と違います: ${JSON.stringify(r)}`
      )
    }
    const [no, name, rawLabel, rawNote] = r
    if (!/^[1-9]\d*$/.test(no.trim())) {
      throw new Error(`いわき市CSVの${line}行目の番号が数字ではありません: ${JSON.stringify(r)}`)
    }
    if (seen.has(no.trim()) && !KNOWN_DUPLICATE_NUMBERS.has(no.trim())) {
      throw new Error(`いわき市CSVの番号 ${no} が重複しています(行がずれた可能性)`)
    }
    seen.add(no.trim())
    maxNo = Math.max(maxNo, Number(no))
    if ([name, rawLabel, rawNote].some((c) => c.includes("�"))) {
      throw new Error(`いわき市CSVの${line}行目に文字化けがあります: ${JSON.stringify(r)}`)
    }
    const label = LABELS[rawLabel.trim()]
    if (!label) {
      throw new Error(
        `いわき市CSVの${line}行目の区分の表記が想定外です(冊子で正式名を確かめて LABELS に足す): ${JSON.stringify(rawLabel)}`
      )
    }
    if (!name.trim()) {
      throw new Error(`いわき市CSVの${line}行目の品名が空です: ${JSON.stringify(r)}`)
    }
    // 市の注意点は原文のまま(セル内の改行もそのまま)。内部向けのメモ2つだけ外し、語の説明を後ろに足す
    let note = rawNote.replace(/\r\n?/g, "\n")
    for (const memo of INTERNAL_MEMOS) note = note.replace(memo, "")
    const gloss = glossFor(note)
    if (gloss && note.trim()) note = `${note.trim()}\n${gloss}`
    lines.push(
      [LG_CODE, no.trim(), name.trim(), label, note]
        .map(quote)
        .join(",")
    )
  })
  // 番号は 1〜行数(行が抜けたり、セル内の改行で行が割れたりしたら気づける)
  if (maxNo !== body.length) {
    throw new Error(
      `いわき市CSVの品目数(${body.length})と最後の番号(${maxNo})が合いません(行が欠けた・割れた可能性)`
    )
  }
  return lines.join("\n") + "\n"
}
