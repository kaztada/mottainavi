/**
 * 第2段の総当たり(data-model.md §30): 国内のデータカタログの応答から、未調査の市区町村ごとに
 * 「品目別の分別データがあるか」を判定する部分。ネットワークに出ない純粋な関数だけを置く
 * (取得は scripts/core/polite-fetch.ts、手順は scripts/tools/catalog-sweep.ts)。
 *
 * 機械が出すのは提案で、台帳に書くのは人(Claude)が見直してから。機械で決めきれないものは
 * 「見つからない」にせず「要確認」に回す。
 */
import { z } from "zod"
import type { RegistryEntry } from "../../src/lib/schemas"
import { isStandardHeader, normalizeLabel } from "./standard-csv"

// ---------------------------------------------------------------- 探し先の一覧(data/catalogs.json)

export const CatalogDefSchema = z.object({
  /** 探し先の ID(キャッシュのファイル名にも使う) */
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** 記録・画面に出さない台帳の searched に書く名前 */
  label: z.string().min(1),
  /** 人が見るためのトップページ */
  site: z.string().url(),
  /**
   * 問い合わせの仕方。ckan = CKAN の package_search、search-ckan = search.ckan.jp(CKAN 互換の横断検索)、
   * manual = API が無く、人がサイト内検索で確かめた(結果は manual に書く)
   */
  kind: z.enum(["ckan", "search-ckan", "manual"]),
  /** CKAN の API の入口(…/api/3/action) */
  api: z.string().url().optional(),
  /** package_search の q と fq(カタログごとに語の扱いが違うため、それぞれに書く) */
  query: z.string().optional(),
  /**
   * 追加の q(結果は合わせる)。BODIK は日本語の検索で取りこぼすことがある(2026-10-16 の棚卸し)ので、
   * データセットの名前(garbage・gomi・bunbetsu など)でも探す
   */
  extraQueries: z.array(z.string()).optional(),
  fq: z.string().optional(),
  /** 1ページの件数(既定 1000。応答が大きいカタログは小さくする) */
  rows: z.number().int().min(10).max(1000).optional(),
  /** データセットのページの URL。{name} を CKAN の name に置き換える(search-ckan は応答の URL を使う) */
  datasetUrl: z.string().optional(),
  /**
   * 組織 ID から自治体コードを取り出す形。lg = 6桁そのまま(BODIK・SHIRASAGI の地域 chiiki/<6桁>)、
   * t-lg = t + 6桁(東京都)。無ければ組織名・サイト名・題名から名前で結びつける
   */
  orgCode: z.enum(["lg", "t-lg"]).optional(),
  /** 対象の都道府県(県のカタログ)。無ければ全国 */
  prefs: z.array(z.string()).optional(),
  /**
   * この探し先が、県のカタログを兼ねる・含む都道府県(BODIK = 九州などの県のカタログ、
   * search.ckan.jp = 索引に入っている県のカタログ)。県の棚卸しが済んだかの判定に使う
   */
  coversPrefCatalogs: z.array(z.string()).optional(),
  /** ライセンスが選択肢の名前だけで返るカタログ(SHIRASAGI)。名前を完全一致で照らす */
  licenseByTitle: z.boolean().optional(),
  /**
   * 使わないデータセットのホスト(横断検索の索引に残っている、もう無いカタログ。
   * 例: 静岡県の旧カタログ ckan.pref.shizuoka.jp は新しいカタログに移って名前が引けない)
   */
  excludeHosts: z.array(z.string()).optional(),
  /** 1つの自治体だけのカタログ(市の自前のカタログ)なら、その slug */
  municipality: z.string().optional(),
  /**
   * manual のときの結果: 確かめた日・確かめ方と、品目の一覧らしいファイルが見つかった市区町村。
   * 見つかったファイルも、ほかの探し先と同じく1回だけ取得して見出しを見る
   */
  manual: z
    .object({
      checked_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      how: z.string().min(1),
      found: z
        .array(
          z.object({
            slug: z.string(),
            title: z.string().min(1),
            page: z.string().url(),
            file: z.string().url(),
            license: z.object({ id: z.string().optional(), url: z.string().url().optional() }),
          })
        )
        .default([]),
    })
    .optional(),
  /**
   * 組織名・題名 → 当てはまる市区町村(一部事務組合・広域連合など、機械で決めきれないもの)。
   * 同じ分け方が当てはまる範囲を根拠(evidence の URL)で確かめてから、人が書く
   */
  mappings: z
    .record(
      z.string(),
      z.object({ slugs: z.array(z.string()).min(1), evidence: z.string().url() })
    )
    .optional(),
  /** 棚卸しのメモ(機械は読まない) */
  memo: z.string().optional(),
})
export type CatalogDef = z.infer<typeof CatalogDefSchema>
export const CatalogsFileSchema = z.array(CatalogDefSchema)

// ---------------------------------------------------------------- CKAN の応答をそろえる

export type License = { id: string | null; title: string | null; url: string | null }

export type Resource = {
  id: string | null
  name: string
  format: string
  url: string
  /** カタログの更新日(データの基準日ではない) */
  modified: string | null
  license: License
}

export type Dataset = {
  catalog: string
  /** CKAN の name(search.ckan.jp は xckan_id) */
  id: string
  /** 人が開くページ */
  url: string
  title: string
  org: { id: string; title: string }
  /** search.ckan.jp のときの元のサイト名 */
  site: string | null
  tags: string[]
  notes: string
  license: License
  /** ライセンスを選択肢の名前で照らすカタログ(SHIRASAGI)のデータセット */
  licenseByTitle?: boolean
  modified: string | null
  resources: Resource[]
}

/** 文字列に(dataeye は name・組織の ID を数で返す) */
const str = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : ""
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null

function licenseOf(o: Record<string, unknown>): License {
  // SHIRASAGI(北海道・香川・鳥取・徳島・愛媛などのカタログ)はリソースに { name: "表示（CC BY）" } を持つ
  if (o.license && typeof o.license === "object") {
    const l = o.license as Record<string, unknown>
    return { id: null, title: strOrNull(l.name), url: null }
  }
  return {
    // dataeye(島根・岡山・広島のカタログ)はリソースごとに resource_license_id を持つ
    id: strOrNull(o.license_id) ?? strOrNull(o.resource_license_id),
    title: strOrNull(o.license_title),
    url: strOrNull(o.license_url),
  }
}

/**
 * CKAN の package(package_search の results の1件)を、判定に使う形にそろえる。
 * CKAN 互換の応答を返す dataeye(/ckan_api)と SHIRASAGI(/api/package_search)も読む
 */
export function normalizePackage(pkg: unknown, cat: CatalogDef): Dataset {
  const p = (pkg ?? {}) as Record<string, unknown>
  // SHIRASAGI は組織の代わりに地域(areas: [{ name: "室蘭市", filename: "chiiki/012050" }])を持ち、name が題名
  const areas = Array.isArray(p.areas) ? (p.areas as Record<string, unknown>[]) : null
  const org = areas
    ? {
        name: areas.length === 1 ? str(areas[0].filename).replace(/^chiiki\//, "") : "",
        title: areas.map((a) => str(a.name)).join("・"),
      }
    : ((p.organization ?? {}) as Record<string, unknown>)
  const dsLicense = licenseOf(p)
  const resources = (Array.isArray(p.resources) ? p.resources : []).map(
    (r: Record<string, unknown>): Resource => {
      const own = licenseOf(r)
      return {
        id: strOrNull(r.id),
        name: str(r.name),
        format: str(r.format).toUpperCase(),
        // SHIRASAGI の url(/fs/…)は取得できず、download_url が本体
        url: str(r.download_url) || str(r.url),
        modified: strOrNull(r.last_modified) ?? strOrNull(r.updated) ?? strOrNull(r.created),
        // リソースに個別のライセンスがあればそれ、無ければデータセットのもの
        license: own.id || own.url || own.title ? own : dsLicense,
      }
    }
  )
  const name = areas ? str(p.id) : str(p.name)
  const isSearch = cat.kind === "search-ckan"
  const url = isSearch
    ? str(p.xckan_site_url)
    : cat.datasetUrl
      ? cat.datasetUrl.replace("{name}", encodeURIComponent(name))
      : str(p.url)
  return {
    catalog: cat.id,
    id: isSearch ? str(p.xckan_id) || name : name,
    url,
    title: str(p.title) || str(p.xckan_title) || (areas ? str(p.name) : ""),
    org: { id: str(org.name), title: str(org.title) },
    site: isSearch ? strOrNull(p.xckan_site_name) : null,
    tags: (Array.isArray(p.tags) ? p.tags : [])
      .map((t: Record<string, unknown>) => str(t.name))
      .filter(Boolean),
    // 説明は長いので、手がかりに足りる長さだけ残す(キャッシュをコミットするため)
    notes: (str(p.notes) || str(p.xckan_description) || str(p.text)).slice(0, 200),
    license: dsLicense,
    ...(cat.licenseByTitle ? { licenseByTitle: true } : {}),
    modified:
      strOrNull(p.metadata_modified) ?? strOrNull(p.xckan_last_updated) ?? strOrNull(p.updated),
    resources,
  }
}

/** manual の探し先で見つかったファイルを、判定に使う形にする */
export function manualDatasets(cat: CatalogDef, idx: RegistryIndex): Dataset[] {
  return (cat.manual?.found ?? []).map((f) => {
    const e = idx.bySlug.get(f.slug)
    const license: License = { id: f.license.id ?? null, title: null, url: f.license.url ?? null }
    return {
      catalog: cat.id,
      id: f.file,
      url: f.page,
      title: f.title,
      org: { id: "", title: e ? `${e.pref}${e.name_ja}` : f.slug },
      site: null,
      tags: [],
      notes: "",
      license,
      modified: null,
      resources: [
        { id: null, name: f.title, format: "", url: f.file, modified: null, license },
      ],
    }
  })
}

// ---------------------------------------------------------------- ごみに関係するか・題名の手がかり

const GARBAGE = /ごみ|ゴミ|塵芥|分別|資源物|粗大|廃棄物/
/** 品目の一覧らしい語 */
const ITEM_WORDS = /分別|品目|分け方|出し方|辞典|事典|五十音|50音|早見|一覧/
/** 品目の一覧ではなさそうな語(これだけで外さない。表の見出しでも確かめる) */
const NON_ITEM_WORDS =
  /カレンダー|カレンダ|収集日|収集曜日|集積所|ステーション|拠点|統計|処理量|排出量|実績|施設|回収ボックス|回収場所|地区別|処理状況/

/** ごみ・分別に関係するデータセットか(広く拾う。題名・タグ・リソース名) */
export function isGarbageRelated(ds: Dataset): boolean {
  const text = [ds.title, ...ds.tags, ...ds.resources.map((r) => r.name)].join(" ")
  return GARBAGE.test(text)
}

export type TitleSignal = "item" | "non-item" | "neutral"

/** 題名とリソース名の手がかり。品目らしい語があれば item、無くて品目でなさそうな語だけなら non-item */
export function titleSignal(text: string): TitleSignal {
  if (ITEM_WORDS.test(text)) return "item"
  if (NON_ITEM_WORDS.test(text)) return "non-item"
  return "neutral"
}

// ---------------------------------------------------------------- ファイルの形式

export type FileKind = "csv" | "excel" | "pdf" | "html" | "other"

export function fileKind(r: Pick<Resource, "format" | "url">): FileKind {
  const f = r.format.toLowerCase()
  const ext = (r.url.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase()
  const has = (...xs: string[]) => xs.includes(f) || xs.includes(ext)
  if (has("csv", "tsv", "txt")) return "csv"
  if (has("xlsx", "xls", "xlsm", "ods")) return "excel"
  if (has("pdf")) return "pdf"
  if (has("html", "htm")) return "html"
  return "other"
}

/**
 * 中身を見るリソース: 表(CSV・Excel)を新しい順に3つと、名前に品目らしい語がある表はすべて
 * (年度ごとのカレンダーが多いデータセットに「ごみの分別情報」が埋もれていることがあるため)
 */
export function resourcesToPeek(ds: Dataset): Resource[] {
  const tables = ds.resources
    .filter((r) => r.url && (fileKind(r) === "csv" || fileKind(r) === "excel"))
    .sort((a, b) => (b.modified ?? "").localeCompare(a.modified ?? ""))
  const picked = new Set([...tables.slice(0, 3), ...tables.filter((r) => ITEM_WORDS.test(r.name))])
  return tables.filter((r) => picked.has(r))
}

// ---------------------------------------------------------------- 表の見出しを見る

/**
 * 品目の列の名前(接頭辞を除き NFKC・空白なしで比べる)。「ゴミの品目」は標準形式の新しい版、
 * name は 5374(ごみ分別アプリ)の形式
 */
const ITEM_COL =
  /^(品目|品名|品目名|名称|ごみの名前|ごみの名称|ごみの品目|ゴミの品目|ごみの種類|品物|対象品目|物品名|名前|ごみ名|主な品目|name|item|itemName)(_?1)?$/i
/** 分け方の列の名前(type は 5374 の形式) */
const METHOD_COL =
  /分別区分|区分|出し方|分け方|分別|分類|収集区分|種別|ごみの種類|処理方法|排出方法|^type$|^category$|^label$|^sortingType$/i
/** 品目の一覧ではない表の列(カレンダー・集積所・施設・統計) */
const NON_ITEM_COL =
  /収集日|曜日|日付|年月日|地区|校区|地名|町名|町丁|緯度|経度|所在地|住所|郵便番号|電話|排出量|処理量|収集量|搬入量|トン|\[t\]|\[件\]|\[回\]|\[人\]|人口|世帯|^月$|^月別$|年度|年月|西暦|和暦|施設|業者|状況|処理経費|組成|推移|手数料|統計名|水質|消防|国勢|^#LINK/
/** 施設・集積所の一覧の列(これがあれば品目の一覧ではない) */
const LOCATION_COL = /緯度|経度|所在地|住所|郵便番号/
/** 品目の一覧らしい列(分け方の列が見つからなくても、これがあれば決めつけない) */
const ITEMISH_COL = /質問|キーワード|よみ|ひらがな|ふりがな|品目|品名|物品/
/** 区分の定義だけの表(標準形式のデータセットに品目の表と並んで入っている) */
const CATEGORY_TABLE_COL = /^(ゴミ区分|ごみ区分|ゴミ分類区分|ごみ分類区分|区分名|区分の説明)$/
/** 団体コードの列 */
const CODE_COL = /^(全国地方公共団体コード|地方公共団体コード|市区町村コード)$/

/** 「品目の一覧」とみなす最小の行数(大津市の9行のような種類別の表を外す) */
export const MIN_ITEM_ROWS = 50

export type TableCheck = {
  /** item-list = 自動で候補にできる / not-item = 品目の一覧ではない表 / unknown = 決めきれない(要確認) */
  kind: "item-list" | "not-item" | "unknown"
  reason: string
  header: string[] | null
  rows: number
  /** 国の標準形式の見出し(接頭辞つき)なら true */
  standard: boolean
  /** 標準形式の「全国地方公共団体コード」の列の値(重複なし) */
  codes: string[]
}

function stripPrefix(col: string): string {
  return normalizeLabel(col).replace(/^(ごみの分別方法|ゴミの分別方法)_/, "")
}

/** 表(行の配列)の見出しを探して、品目の一覧かを判定する。見出しは先頭10行から探す */
export function analyzeTable(rows: string[][]): TableCheck {
  const empty = { header: null, rows: 0, standard: false, codes: [] as string[] }
  if (rows.length === 0) return { kind: "unknown", reason: "空のファイル", ...empty }
  for (let h = 0; h < Math.min(10, rows.length); h++) {
    const header = rows[h].map((c) => c.trim())
    const cols = header.map(stripPrefix)
    const itemCol = cols.findIndex((c) => ITEM_COL.test(c))
    const methodCol = cols.findIndex((c, i) => i !== itemCol && METHOD_COL.test(c))
    if (itemCol < 0 || methodCol < 0) continue
    const body = rows.slice(h + 1).filter((r) => (r[itemCol] ?? "").trim() !== "")
    // 標準形式: 先頭5列がそのとおり、または新しい版(地方公共団体名の列と「ゴミの品目」がある)
    const standard =
      isStandardHeader(header) ||
      (cols.some((c) => c === "全国地方公共団体コード") && cols.includes("分別区分") && itemCol >= 0)
    const codeCol = cols.findIndex((c) => CODE_COL.test(c))
    const codes =
      codeCol >= 0 ? [...new Set(body.map((r) => (r[codeCol] ?? "").trim()).filter(Boolean))] : []
    const base = { header, rows: body.length, standard, codes }
    if (body.length < MIN_ITEM_ROWS)
      return { kind: "unknown", reason: `品目の行が ${body.length} 行だけ`, ...base }
    return { kind: "item-list", reason: "品目と分け方の列がある", ...base }
  }
  const first = rows[0].map(stripPrefix)
  if (first.some((c) => CATEGORY_TABLE_COL.test(c)))
    return {
      kind: "not-item",
      reason: `区分の定義の表(見出し: ${first.slice(0, 6).join(" / ")})`,
      ...empty,
      header: rows[0],
    }
  // 位置の列(住所・緯度など)がある表は、施設・集積所の一覧で品目の一覧ではない
  if (first.some((c) => LOCATION_COL.test(c)))
    return {
      kind: "not-item",
      reason: `施設・場所の一覧(見出し: ${first.slice(0, 6).join(" / ")})`,
      ...empty,
      header: rows[0],
    }
  // 品目らしい列(品目・名称・質問・キーワード・よみ など)があれば、ほかの列が統計らしくても決めつけない(要確認)
  // (相模原市の「データID / 質問 / 検索キーワード / 粗大ごみ戸別収集手数料」のような品目の一覧があるため)
  if (first.some((c) => ITEM_COL.test(c) || ITEMISH_COL.test(c)))
    return {
      kind: "unknown",
      reason: `品目らしい列はあるが分け方の列が分からない(先頭行: ${first.slice(0, 6).join(" / ")})`,
      ...empty,
      header: rows[0],
    }
  // 施設・統計・カレンダーの列があれば品目の一覧ではない
  if (first.some((c) => NON_ITEM_COL.test(c)))
    return {
      kind: "not-item",
      reason: `品目の一覧ではない表(見出し: ${first.slice(0, 6).join(" / ")})`,
      ...empty,
      header: rows[0],
    }
  return {
    kind: "unknown",
    reason: `見出しから判断できない(先頭行: ${first.slice(0, 6).join(" / ")})`,
    ...empty,
    header: rows[0],
  }
}

// ---------------------------------------------------------------- ライセンス

/**
 * 使えるライセンス(カタログに登録された ID または URL と完全一致で照らす。名前の部分一致では通さない)。
 * CC BY(版の記載なし・2.1 日本・4.0)、CC0、公共データ利用規約(PDL1.0、2026-10-08 Kaz 承認)
 */
const OPEN_LICENSE_IDS = new Set([
  "cc-by",
  "CC-BY-4.0",
  "cc-by-4.0",
  "cc-by-40-intl",
  "cc-by-21",
  "cc-by-21-jp",
  "CC-BY-2.1-JP",
  "CC-BY-2.1",
  "cc-zero",
  "CC0-1.0",
  "PDL1.0",
  "pdl-1.0",
  // dataeye の「公共データ利用規約」(版は 1.0 しか無い)と CC BY 4.0
  "pdl",
  "cc-by4_0",
])
/** SHIRASAGI のライセンスの名前(カタログが決めた選択肢の名前と完全一致) */
const OPEN_LICENSE_TITLES = new Set(["表示（CC BY）", "表示(CC BY)", "CC BY 4.0", "CC BY"])
const OPEN_LICENSE_URLS = new Set([
  "https://creativecommons.org/licenses/by/4.0/",
  "https://creativecommons.org/licenses/by/4.0/deed.ja",
  "https://creativecommons.org/licenses/by/2.1/jp/",
  "http://creativecommons.org/licenses/by/4.0/",
  "http://creativecommons.org/licenses/by/2.1/jp/",
  "https://creativecommons.org/publicdomain/zero/1.0/",
  "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0",
])

export type LicenseClass = "open" | "unknown"

/** カタログの登録の上で使えそうか。open は「登録の上で」であって、原文の確認は抜き取り照合で行う */
export function classifyLicense(l: License, opts?: { licenseByTitle?: boolean }): LicenseClass {
  if (l.id && OPEN_LICENSE_IDS.has(l.id)) return "open"
  if (l.url && OPEN_LICENSE_URLS.has(l.url.trim())) return "open"
  // 名前で照らすのは、ライセンスが選択肢の名前だけで返るカタログ(SHIRASAGI)に限る
  if (opts?.licenseByTitle && l.title && OPEN_LICENSE_TITLES.has(l.title.trim())) return "open"
  return "unknown"
}

// ---------------------------------------------------------------- データの基準日

/** 題名・ファイル名から、データの年(西暦)を読む。令和N年度・RN・20YY。読めなければ null(新しい扱いにしない) */
export function dataYear(texts: readonly string[]): number | null {
  let best: number | null = null
  const put = (y: number) => {
    if (y >= 2000 && y <= 2100 && (best === null || y > best)) best = y
  }
  for (const raw of texts) {
    const t = raw.normalize("NFKC")
    for (const m of t.matchAll(/令和\s*(\d{1,2}|元)\s*年/g))
      put(2018 + (m[1] === "元" ? 1 : Number(m[1])))
    for (const m of t.matchAll(/(?:^|[^A-Za-z0-9])R(\d{1,2})(?![0-9])/g)) put(2018 + Number(m[1]))
    for (const m of t.matchAll(/(?:^|[^0-9])(20\d{2})(?:[^0-9]|$)/g)) put(Number(m[1]))
    for (const m of t.matchAll(/(?:^|[^0-9])(20\d{2})(0[1-9]|1[0-2])(?:\d{2})?(?:[^0-9]|$)/g))
      put(Number(m[1]))
  }
  return best
}

// ---------------------------------------------------------------- 自治体との結びつけ

export type Match =
  | { kind: "matched"; slug: string; by: "org-code" | "own-catalog" | "name" }
  | { kind: "none" }
  | { kind: "review"; reason: string; slugs: string[] }

/** 一部事務組合・広域連合など、複数の市町村にまたがる組織の名前 */
const UNION = /組合|広域|連合|定住自立圏|協議会|圏域/

export type RegistryIndex = {
  byCode: Map<string, RegistryEntry>
  bySlug: Map<string, RegistryEntry>
  /** 名前 → 同じ名前の自治体(都道府県違い) */
  byName: Map<string, RegistryEntry[]>
  /** 長い順の名前の一覧(東大和市と大和市の取り違えを防ぐため、長いほうを先に当てる) */
  names: string[]
}

export function indexRegistry(registry: readonly RegistryEntry[]): RegistryIndex {
  const byName = new Map<string, RegistryEntry[]>()
  for (const e of registry) byName.set(e.name_ja, [...(byName.get(e.name_ja) ?? []), e])
  return {
    byCode: new Map(registry.map((e) => [e.lg_code, e])),
    bySlug: new Map(registry.map((e) => [e.slug, e])),
    byName,
    names: [...byName.keys()].sort((a, b) => b.length - a.length),
  }
}

/** 文の中に出てくる自治体の名前(長い名前の中に含まれる短い名前は数えない) */
export function namesIn(text: string, idx: RegistryIndex): string[] {
  const taken: [number, number][] = []
  const out: string[] = []
  for (const name of idx.names) {
    let from = 0
    for (;;) {
      const i = text.indexOf(name, from)
      if (i < 0) break
      const j = i + name.length
      if (!taken.some(([a, b]) => i < b && a < j)) {
        taken.push([i, j])
        if (!out.includes(name)) out.push(name)
      }
      from = i + 1
    }
  }
  return out
}

const PREFS = /北海道|東京都|京都府|大阪府|.{2,3}県/g

/**
 * データセットを自治体に結びつける。組織 ID のコード(BODIK・東京都)と市の自前のカタログは確定、
 * ほかは組織名・サイト名・題名の名前で探し、1つに決まれば確定(都道府県が書いてあれば絞る)。
 * 組合・広域、複数の自治体、決まらないものは要確認
 */
export function matchMunicipality(
  ds: Dataset,
  cat: CatalogDef,
  idx: RegistryIndex
): Match {
  const orgText = `${ds.org.title} ${ds.site ?? ""}`
  if (UNION.test(`${orgText} ${ds.title}`))
    return { kind: "review", reason: "組合・広域など複数の市町村の組織", slugs: [] }
  if (cat.orgCode) {
    const code = cat.orgCode === "t-lg" ? ds.org.id.replace(/^t/, "") : ds.org.id
    const e = idx.byCode.get(code)
    if (e) return { kind: "matched", slug: e.slug, by: "org-code" }
    // 県の組織などコードが自治体でないもの: 名前で探す(下へ)
  }
  if (cat.municipality) return { kind: "matched", slug: cat.municipality, by: "own-catalog" }

  const prefsIn = (t: string) => [...new Set(t.match(PREFS) ?? [])]
  // 組織名・サイト名を先に、無ければ題名で
  for (const text of [orgText, ds.title]) {
    const names = namesIn(text, idx)
    if (names.length === 0) continue
    const prefs = [...prefsIn(text), ...(cat.prefs ?? [])]
    const cands = names.flatMap((n) => idx.byName.get(n) ?? [])
    const narrowed = prefs.length > 0 ? cands.filter((e) => prefs.includes(e.pref)) : cands
    const pool = narrowed.length > 0 ? narrowed : cands
    if (pool.length === 1) return { kind: "matched", slug: pool[0].slug, by: "name" }
    return {
      kind: "review",
      reason:
        names.length > 1 ? `複数の自治体の名前: ${names.join("・")}` : `同じ名前の自治体: ${names[0]}`,
      slugs: pool.map((e) => e.slug),
    }
  }
  return { kind: "none" }
}

// ---------------------------------------------------------------- 1つのデータセットの判定

export type PeekResult = {
  url: string
  /** 取得できなかったとき */
  error?: string
  table?: TableCheck
}

export type DatasetVerdict = {
  catalog: string
  dataset: string
  datasetUrl: string
  title: string
  slug: string | null
  /** item-list = 品目の一覧(自動で候補) / not-item = 品目の一覧ではない / review = 要確認 */
  verdict: "item-list" | "not-item" | "review"
  reason: string
  resourceUrl: string | null
  format: "standard" | "csv" | "excel" | "pdf" | "html" | "other" | null
  license: LicenseClass
  licenseLabel: string
  /** データの基準日(年)。読めなければ null */
  dataYear: number | null
  /** カタログの更新日 */
  catalogDate: string | null
  rows: number
}

/**
 * データセット1つを判定する。表を見て品目の一覧なら item-list、品目でない表・題名だけで明らかなら not-item、
 * それ以外(PDF・見出しが読めない・取得できない・結びつけが決まらない・コードが合わない)は review
 */
export function judgeDataset(
  ds: Dataset,
  match: Match,
  peeks: readonly PeekResult[],
  idx: RegistryIndex
): DatasetVerdict {
  const slug = match.kind === "matched" ? match.slug : null
  const signal = titleSignal([ds.title, ...ds.resources.map((r) => r.name)].join(" "))
  const base = {
    catalog: ds.catalog,
    dataset: ds.id,
    datasetUrl: ds.url,
    title: ds.title,
    slug,
    resourceUrl: null as string | null,
    format: null as DatasetVerdict["format"],
    license: classifyLicense(ds.license, ds),
    licenseLabel: ds.license.id ?? ds.license.title ?? ds.license.url ?? "(なし)",
    dataYear: dataYear([ds.title, ...ds.resources.map((r) => `${r.name} ${r.url}`)]),
    catalogDate: ds.modified,
    rows: 0,
  }
  const items = peeks.filter((p) => p.table?.kind === "item-list")
  if (items.length > 0) {
    const p = items[0]
    const res = ds.resources.find((r) => r.url === p.url)
    const t = p.table as TableCheck
    const out: DatasetVerdict = {
      ...base,
      verdict: "item-list",
      reason: t.reason,
      resourceUrl: p.url,
      format: t.standard ? "standard" : res ? (fileKind(res) as DatasetVerdict["format"]) : "csv",
      license: res ? classifyLicense(res.license, ds) : base.license,
      licenseLabel: res ? (res.license.id ?? res.license.title ?? res.license.url ?? "(なし)") : base.licenseLabel,
      dataYear: dataYear([ds.title, res?.name ?? "", res?.url ?? ""]) ?? base.dataYear,
      catalogDate: res?.modified ?? ds.modified,
      rows: t.rows,
    }
    if (match.kind !== "matched")
      return { ...out, verdict: "review", reason: `品目の一覧だが自治体が決まらない(${match.kind === "review" ? match.reason : "名前が無い"})` }
    // 標準形式はファイルの中の団体コードとレジストリを照らす(5桁=検査数字なしでも可)
    if (t.standard) {
      const code = idx.bySlug.get(match.slug)?.lg_code ?? ""
      const ok = t.codes.length > 0 && t.codes.every((c) => c === code || c === code.slice(0, 5))
      if (!ok)
        return { ...out, verdict: "review", reason: `ファイルの団体コード(${t.codes.slice(0, 3).join("・") || "空"})が ${code} と合わない` }
    }
    return out
  }
  const errors = peeks.filter((p) => p.error)
  if (errors.length > 0)
    return { ...base, verdict: "review", reason: `取得できないファイルがある: ${errors[0].error}` }
  const unknown = peeks.filter((p) => p.table?.kind === "unknown")
  if (unknown.length > 0)
    return { ...base, verdict: "review", reason: unknown[0].table?.reason ?? "表を判断できない", resourceUrl: unknown[0].url }
  // 読んでいない表が残っていて、題名がはっきり統計・カレンダーなどでなければ決めつけない(要確認)
  const peekedUrls = new Set(peeks.map((p) => p.url))
  const unread = ds.resources.filter(
    (r) => r.url && ["csv", "excel"].includes(fileKind(r)) && !peekedUrls.has(r.url)
  )
  if (unread.length > 0 && titleSignal(ds.title) !== "non-item")
    return { ...base, verdict: "review", reason: `読んでいない表が ${unread.length} 件ある` }
  // 表が無い・表はすべて品目の一覧ではない
  const nonTable = ds.resources.filter((r) => !["csv", "excel"].includes(fileKind(r)))
  if (peeks.length > 0 && nonTable.length === 0)
    return { ...base, verdict: "not-item", reason: peeks.map((p) => p.table?.reason).join(" / ") }
  if (signal === "non-item")
    return { ...base, verdict: "not-item", reason: "題名・リソース名が品目の一覧ではない(カレンダー・集積所など)" }
  if (signal === "item" && nonTable.length > 0) {
    const r = nonTable[0]
    return {
      ...base,
      verdict: "review",
      reason: `品目の一覧かもしれない ${fileKind(r).toUpperCase()}`,
      resourceUrl: r.url,
      format: fileKind(r) as DatasetVerdict["format"],
    }
  }
  if (peeks.length > 0)
    return { ...base, verdict: "not-item", reason: peeks.map((p) => p.table?.reason).join(" / ") }
  return { ...base, verdict: "review", reason: "表が無く、題名からも判断できない" }
}

// ---------------------------------------------------------------- 台帳への提案

export type SourceStatus = {
  /** 探し先の ID(catalogs.json)、または own-site(市のサイトの確認) */
  id: string
  label: string
  url: string
  /** 最後まで調べ終わったか(問い合わせの成功・ページ送りの完了) */
  complete: boolean
  checked_at: string | null
}

export type Proposal = {
  slug: string
  /** 書く前の状態(書き込みの時点で違えば止める) */
  expect: string
  bucket: "candidate" | "license" | "no-data" | "review" | "incomplete" | "surveyed-review" | "surveyed"
  reason: string
  entry: Record<string, unknown> | null
  verdicts: DatasetVerdict[]
}

/** 第1群の見込み: 標準形式・登録の上で使えそう・基準日が2年以内 */
export function looksGroup1(v: DatasetVerdict, today: string): boolean {
  const year = Number(today.slice(0, 4))
  return (
    v.format === "standard" && v.license === "open" && v.dataYear !== null && v.dataYear >= year - 2
  )
}

const noteOf = (v: DatasetVerdict, today: string) =>
  [
    `総当たり ${today}: ${v.format ?? "?"}・${v.rows}行`,
    `データの基準日 ${v.dataYear ?? "不明"}`,
    `カタログの更新日 ${v.catalogDate?.slice(0, 10) ?? "不明"}`,
    `ライセンスの登録 ${v.licenseLabel}${v.license === "open" ? "" : "(登録からは確かめられない。原文を確かめる)"}`,
    looksGroup1(v, today) ? "第1群の見込み" : null,
  ]
    .filter(Boolean)
    .join("・")

/**
 * 1つの自治体の提案を作る。未調査の市だけを書き換えの対象にし、調べ済みの市は新しい根拠があれば
 * 「見直し候補」に出すだけ。no-data は、当てはまる探し先をすべて最後まで調べ終わり、要確認が無いときだけ
 */
export function proposeFor(
  entry: RegistryEntry,
  current: { status: string; checked_at?: string },
  verdicts: readonly DatasetVerdict[],
  sources: readonly SourceStatus[],
  opts: { today: string; catalogOnly: boolean }
): Proposal {
  const mine = verdicts.filter((v) => v.slug === entry.slug)
  const items = mine.filter((v) => v.verdict === "item-list")
  const reviews = mine.filter((v) => v.verdict === "review")
  const base = { slug: entry.slug, expect: current.status, verdicts: mine }
  if (current.status !== "unsurveyed") {
    const fresh = [...items, ...reviews]
    return fresh.length > 0
      ? { ...base, bucket: "surveyed-review", reason: `調べ済み(${current.status})の市に、カタログのデータ ${fresh.length} 件`, entry: null }
      : { ...base, bucket: "surveyed", reason: "調べ済み", entry: null }
  }
  // 品目の一覧が1つでもあれば確認中(ほかのデータセットの要確認は、見つからないを止めるためだけに使う)
  if (items.length === 0 && reviews.length > 0)
    return { ...base, bucket: "review", reason: reviews.map((v) => v.reason).join(" / "), entry: null }
  const best = [...items].sort(
    (a, b) =>
      Number(looksGroup1(b, opts.today)) - Number(looksGroup1(a, opts.today)) ||
      Number(b.license === "open") - Number(a.license === "open") ||
      (b.dataYear ?? 0) - (a.dataYear ?? 0)
  )[0]
  if (best) {
    // ライセンスが登録に無い・読めないだけでは「使える条件を確かめられない」にしない
    // (横断検索などで登録が抜けることがある)。確認中にして、抜き取り照合で規約の原文を確かめる
    const status = "candidate"
    return {
      ...base,
      bucket: status,
      reason: best.reason,
      entry: {
        status,
        checked_at: opts.today,
        evidence: [
          { label: `${best.title}(${best.catalog})`, url: best.datasetUrl || undefined },
          ...(best.resourceUrl ? [{ label: "ファイル", url: best.resourceUrl }] : []),
        ],
        note: noteOf(best, opts.today),
      },
    }
  }
  const incomplete = sources.filter((s) => !s.complete)
  if (incomplete.length > 0)
    return {
      ...base,
      bucket: "incomplete",
      reason: `最後まで調べ終わっていない探し先: ${incomplete.map((s) => s.label).join("・")}`,
      entry: null,
    }
  const name = entry.name_ja
  return {
    ...base,
    bucket: "no-data",
    reason: "どの探し先にも品目の一覧が無い",
    entry: {
      status: "no-data",
      checked_at: opts.today,
      ...(opts.catalogOnly
        ? {
            detail_ja: `国内のオープンデータのカタログで探しました。${name}のサイトは個別には確かめていません。`,
            detail_en: `We searched Japan's open data catalogs. We have not checked ${entry.name_en}'s own website individually.`,
          }
        : {}),
      evidence: [{ label: `データカタログの総当たり(${opts.today})。品目別の分別データは見つからなかった` }],
      searched: sources.map((s) => ({ label: s.label, url: s.url })),
    },
  }
}
