import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { parseCsv } from "./csv"
import { fetchBinaryWithCache, fetchWithCache } from "./fetch-cache"
import { CACHE_DIR } from "./paths"
import { readSource } from "./source"
import type { MunicipalityAdapter, RawItem, WatchSpec } from "./types"

/**
 * 国の標準形式(自治体標準オープンデータセット「ごみの分別方法」)の CSV を読む共通アダプタ。
 * 列は「<接頭辞>全国地方公共団体コード, ID, 品目, 分別区分, 注意点, 料金種別, …」。
 * 自治体ごとに書くのは設定(StandardCsvConfig)だけにする(tech-stack.md §11)。
 */
export interface StandardCsvConfig {
  slug: string
  /** エラーメッセージ用の自治体名 */
  name: string
  /** データ更新の見張り方。取得元の URL は data/municipalities/<slug>/source.json に置く */
  watch: WatchSpec
  /** 原本の文字コード。shift_jis(CP932)のときは UTF-8 に復号したものをキャッシュに置く */
  encoding: "utf-8" | "shift_jis"
  /** 列名の接頭辞(自治体によって「ごみの分別方法_」「ゴミの分別方法_」と表記が違う) */
  headerPrefix: string
  expectedMinItems: number
  /** 区分の表記(normalizeLabel 後)→ 区分ID。表記ゆれはここに並べて吸収する */
  labelToId: Record<string, string>
  /** 区分ごとの公式ページ(CSV の行には公式リンクが無いため区分単位で付ける) */
  officialLink: Record<string, string>
  /** 市では収集しない区分。注意点の有無にかかわらず「市では収集しません。」を先頭に置く */
  notCollectedIds?: readonly string[]
  /** 区分ごとに注意文言の先頭へ置く説明(粗大ごみの申込方法など、市のページにある説明) */
  categoryNotes?: Record<string, string>
  /**
   * 区分名と同じ意味の表記(normalizeLabel 後)。指定すると、ここに無い表記
   * (回収協力店の種類・個別指示など)を「出し方: <市の表記>。」として注意文言に残す
   */
  sameAsCategory?: ReadonlySet<string>
  /** 1セルに2区分ある表記の区切り(例: 「不燃ごみ又は処理困難物」の「又は」) */
  labelSeparator?: string
  /** 品目名・注意点の半角カナを全角にする */
  fullWidthKana?: boolean
  /**
   * 注意点のほかに注意文言へ足す列(接頭辞を除いた列名。例: 「料金備考」「備考」)。
   * 市がこれらの列に出し方の注意を書いているとき、原文のまま注意点の後ろに足す(注意文言を欠落させない)
   */
  extraNoteColumns?: readonly string[]
  /**
   * 品目ごとの注記(品目名 → 文言)。市の現行の案内とデータが食い違う品目に、
   * 市のデータは書き換えずに注意文言の先頭へ添える。該当する品目が CSV に無ければエラーにする
   */
  itemNotes?: Record<string, string>
}

export interface StandardCsvAdapter extends MunicipalityAdapter {
  config: StandardCsvConfig
}

export const NOT_COLLECTED_NOTE = "市では収集しません。"

const HEADER_COLUMNS = [
  "全国地方公共団体コード",
  "ID",
  "品目",
  "分別区分",
  "注意点",
]

/** ラベルの正規化: NFKC(半角カナ・全角括弧・英数の統一)→全空白除去 */
export function normalizeLabel(label: string): string {
  return label.normalize("NFKC").replace(/[\s　]/g, "")
}

/**
 * 半角カナ(と半角の句読点・中黒・長音)だけを全角にする。
 * 文字列全体を NFKC にすると全角のかっこ・英数まで変わるため、半角カナの連続部分だけを変換する。
 */
export function toFullWidthKana(s: string): string {
  return s.replace(/[｡-ﾟ]+/g, (m) => m.normalize("NFKC"))
}

export function resolveCategoryId(
  config: StandardCsvConfig,
  label: string
): string | null {
  return config.labelToId[normalizeLabel(label)] ?? null
}

export interface StandardCsvRow {
  name: string
  label: string
  note: string
  /** extraNoteColumns の各列の値(設定が無ければ空) */
  extra: string[]
}

/** CSV テキスト → 行オブジェクト(ヘッダ検証つき。市が列構成を変えたら気づけるように) */
export function readRows(
  config: StandardCsvConfig,
  csvText: string
): StandardCsvRow[] {
  const rows = parseCsv(csvText)
  const header = rows[0]?.map((h) => h.trim())
  const expected = HEADER_COLUMNS.map((h) => config.headerPrefix + h)
  if (!header || expected.some((h, i) => header[i] !== h)) {
    throw new Error(
      `${config.name}CSVの列構成が想定と違います: ${JSON.stringify(header)}`
    )
  }
  const extraCols = (config.extraNoteColumns ?? []).map((col) => {
    const i = header.indexOf(config.headerPrefix + col)
    if (i < 0) {
      throw new Error(
        `${config.name}CSVに列がありません: ${config.headerPrefix + col}`
      )
    }
    return i
  })
  const kana = config.fullWidthKana ? toFullWidthKana : (s: string) => s
  return rows
    .slice(1)
    .filter((r) => r.length >= 4 && r[2].trim())
    .map((r) => ({
      name: kana(r[2].trim()),
      label: r[3].trim(),
      note: kana((r[4] ?? "").trim()),
      extra: extraCols.map((i) => kana((r[i] ?? "").trim())),
    }))
}

/** 1セル2区分の表記を区分ごとに分ける(区切りの設定が無ければそのまま1つ) */
export function splitLabels(config: StandardCsvConfig, label: string): string[] {
  if (!config.labelSeparator) return [label]
  return label
    .split(config.labelSeparator)
    .map((l) => l.trim())
    .filter(Boolean)
}

/**
 * 市の表記を残した注意文言を作る(市の注意点は変えない)。順番は固定:
 * 0. 品目ごとの注記(itemNote。市の現行の案内と食い違う品目だけ)
 * 1. 市では収集しない区分は「市では収集しません。」(誤案内リスク最大の区分のため、注意点が無くても必ず)
 * 2. 市の表記: 1セル2区分の原文(combinedLabel)、または区分名と違う表記を「出し方: …。」
 * 3. 区分の説明(categoryNotes)
 * 4. 市の注意点、続けて extraNoteColumns の列(extraNotes)
 */
export function buildNote(
  config: StandardCsvConfig,
  label: string,
  categoryId: string | null,
  rawNote: string,
  combinedLabel: string | null = null,
  more: { itemNote?: string | null; extraNotes?: readonly string[] } = {}
): string | null {
  const parts: string[] = []
  if (more.itemNote) parts.push(more.itemNote)
  if (categoryId && config.notCollectedIds?.includes(categoryId)) {
    parts.push(NOT_COLLECTED_NOTE)
  }
  if (combinedLabel) {
    parts.push(`出し方: ${combinedLabel}。`)
  } else if (
    categoryId &&
    config.sameAsCategory &&
    !config.sameAsCategory.has(normalizeLabel(label))
  ) {
    parts.push(`出し方: ${label}。`)
  }
  const categoryNote = categoryId ? config.categoryNotes?.[categoryId] : null
  if (categoryNote) parts.push(categoryNote)
  for (const raw of [rawNote, ...(more.extraNotes ?? [])]) {
    const body = raw.replace(/\n{3,}/g, "\n\n").trim()
    if (body) parts.push(body)
  }
  return parts.length ? parts.join("\n") : null
}

/**
 * 同じ品目名の行を1品目にまとめる(品目IDは品目名から振るので、同名が複数あると一意に振れない)。
 * - 区分も注意文言も同じカードは1枚にする
 * - 同じ区分で注意文言が「なし」と「あり」に分かれる場合は、「あり」だけ残す
 * - 区分が違う、または注意文言が違う場合は、それぞれのカードを残す
 * 並びは最初に出てきた順。
 */
export function mergeSameName(
  config: StandardCsvConfig,
  items: RawItem[]
): RawItem[] {
  const byName = new Map<string, RawItem>()
  for (const item of items) {
    const existing = byName.get(item.name_ja)
    if (existing) existing.rows.push(...item.rows)
    else byName.set(item.name_ja, { name_ja: item.name_ja, rows: [...item.rows] })
  }
  const categoryKey = (label: string) =>
    resolveCategoryId(config, label) ?? normalizeLabel(label)
  for (const item of byName.values()) {
    if (item.rows.length < 2) continue
    const seen = new Set<string>()
    const withNote = new Set(
      item.rows.filter((r) => r.note).map((r) => categoryKey(r.category_label))
    )
    item.rows = item.rows.filter((r) => {
      const cat = categoryKey(r.category_label)
      if (!r.note && withNote.has(cat)) return false
      const key = `${cat}\u0000${r.note ?? ""}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  return [...byName.values()]
}

/** CSV テキスト → 共通パイプラインの生レコード(同じ品目名の行は1品目にまとめる) */
export function parseStandardCsv(
  config: StandardCsvConfig,
  csvText: string
): RawItem[] {
  const itemNotes = config.itemNotes ?? {}
  const usedItemNotes = new Set<string>()
  const items = readRows(config, csvText).map((r) => {
    const labels = splitLabels(config, r.label)
    const combined = labels.length > 1 ? r.label : null
    if (r.name in itemNotes) usedItemNotes.add(r.name)
    return {
      name_ja: r.name,
      rows: labels.map((label, i) => {
        const categoryId = resolveCategoryId(config, label)
        return {
          category_label: label,
          note: buildNote(
            config,
            label,
            categoryId,
            r.note,
            i === 0 ? combined : null,
            {
              // 品目ごとの注記は1枚目のカードにだけ添える
              itemNote: i === 0 ? (itemNotes[r.name] ?? null) : null,
              extraNotes: r.extra,
            }
          ),
          official_link: categoryId
            ? (config.officialLink[categoryId] ?? null)
            : null,
        }
      }),
    }
  })
  const unused = Object.keys(itemNotes).filter((n) => !usedItemNotes.has(n))
  if (unused.length > 0) {
    throw new Error(
      `${config.name}: itemNotes の品目が CSV にありません(品目名が変わったか、削除された可能性): ${unused.join(", ")}`
    )
  }
  return mergeSameName(config, items)
}

/**
 * 設定と categories.json の食い違いを列挙する(空なら整合)。
 * 自治体を足すたびにテストを書かなくて済むよう、登録済みの全設定をまとめて検査するのに使う。
 */
export function checkConfig(
  config: StandardCsvConfig,
  categories: { id: string; kind: string }[]
): string[] {
  const problems: string[] = []
  const byId = new Map(categories.map((c) => [c.id, c]))
  for (const [label, id] of Object.entries(config.labelToId)) {
    if (label !== normalizeLabel(label)) {
      problems.push(`labelToId のキーが正規化されていません: ${label}`)
    }
    if (!byId.has(id)) problems.push(`labelToId の区分IDが categories.json にありません: ${id}`)
  }
  for (const c of categories) {
    if (!config.officialLink[c.id]) problems.push(`公式リンクがありません: ${c.id}`)
  }
  for (const id of config.notCollectedIds ?? []) {
    if (byId.get(id)?.kind !== "not-collected") {
      problems.push(`notCollectedIds の区分が kind not-collected ではありません: ${id}`)
    }
  }
  for (const c of categories) {
    if (c.kind === "not-collected" && !config.notCollectedIds?.includes(c.id)) {
      problems.push(`kind not-collected の区分が notCollectedIds にありません: ${c.id}`)
    }
  }
  for (const id of Object.keys(config.categoryNotes ?? {})) {
    if (!byId.has(id)) problems.push(`categoryNotes の区分IDが categories.json にありません: ${id}`)
  }
  for (const label of config.sameAsCategory ?? []) {
    if (!(label in config.labelToId)) {
      problems.push(`sameAsCategory の表記が labelToId にありません: ${label}`)
    }
  }
  return problems
}

/** 設定から MunicipalityAdapter を作る。キャッシュは data/cache/<slug>.csv(UTF-8) */
export function createStandardCsvAdapter(
  config: StandardCsvConfig
): StandardCsvAdapter {
  const cachePath = join(CACHE_DIR, `${config.slug}.csv`)
  const rawCachePath = join(CACHE_DIR, `${config.slug}.cp932.csv`)
  return {
    config,
    slug: config.slug,
    watch: config.watch,
    async fetchSource({ refresh }) {
      const sourceUrl = readSource(config.slug).file_url
      if (config.encoding === "utf-8") {
        const { html, fromCache } = await fetchWithCache(
          sourceUrl,
          cachePath,
          refresh
        )
        return { source: html, fromCache, location: cachePath }
      }
      if (!refresh && existsSync(cachePath)) {
        return {
          source: await readFile(cachePath, "utf-8"),
          fromCache: true,
          location: cachePath,
        }
      }
      const { data } = await fetchBinaryWithCache(
        sourceUrl,
        rawCachePath,
        refresh
      )
      const source = new TextDecoder("shift_jis").decode(data)
      await writeFile(cachePath, source, "utf-8")
      return { source, fromCache: false, location: cachePath }
    },
    parse: (source) => parseStandardCsv(config, source),
    resolveCategoryId: (label) => resolveCategoryId(config, label),
    expectedMinItems: config.expectedMinItems,
  }
}
