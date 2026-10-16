/**
 * 第2段の総当たり: 国内のデータカタログから、未調査の市区町村ごとに品目別の分別データを探し、
 * 仕分けの台帳(data/coverage.json)への提案を作る(data-model.md §30)。
 * 判定は scripts/core/catalog.ts、取得は scripts/core/polite-fetch.ts(1つの URL は1回だけ・ホストごとに間をあける)。
 *
 * 実行: npm run sweep -- population
 *         総務省の住民基本台帳の市区町村別人口(Excel、1回だけ取得)から data/cache/catalog/population.json を作る
 *       npm run sweep -- fetch [--only <探し先の ID>]
 *         data/catalogs.json の探し先(CKAN・search.ckan.jp)に問い合わせ、ごみに関係するデータセットを
 *         work/catalog/<ID>.json に置く(コミットしない)。件数とページ送りの完了も記録する
 *       npm run sweep -- peek [--limit N] [--reanalyze]
 *         品目の一覧かもしれないファイル(表)を1回だけ取得して見出しと行数を見る。結果は
 *         data/cache/catalog/resource-check.json(ファイル本体は work/fetch/ で、コミットしない)。
 *         --reanalyze は判定の規則を変えたとき、取得済みのファイルで見直す(外には接続しない)
 *       npm run sweep -- propose [--today YYYY-MM-DD]
 *         台帳への提案(work/coverage/sweep-<日付>.json。npm run coverage -- apply-proposal で書く)と、
 *         一覧(work/coverage/sweep-<日付>-report.md・-verdicts.tsv)を作る。台帳は書き換えない
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import ExcelJS from "exceljs"
import { todayJst } from "../../src/lib/coverage"
import { cellText } from "../adapters/fukuoka-city/convert"
import {
  CatalogsFileSchema,
  analyzeTable,
  fileKind,
  indexRegistry,
  isGarbageRelated,
  judgeDataset,
  manualDatasets,
  namesIn,
  matchMunicipality,
  normalizePackage,
  proposeFor,
  resourcesToPeek,
  type CatalogDef,
  type Dataset,
  type DatasetVerdict,
  type Match,
  type PeekResult,
  type Proposal,
  type SourceStatus,
  type TableCheck,
} from "../core/catalog"
import { readCoverage, readRegistry } from "../core/coverage-file"
import { parseCsv } from "../core/csv"
import { CACHE_DIR, DATA_DIR, ROOT } from "../core/paths"
import { decodeText, politeFetch } from "../core/polite-fetch"

const CATALOGS_PATH = join(DATA_DIR, "catalogs.json")
const CATALOG_CACHE = join(CACHE_DIR, "catalog")
const RESOURCE_CHECK = join(CATALOG_CACHE, "resource-check.json")
const POPULATION = join(CATALOG_CACHE, "population.json")
const OWN_SITE = join(CATALOG_CACHE, "own-site.json")
/**
 * 要確認を人(エージェント)が見て決めた結果。データセットのページの URL ごとに、品目の一覧か(item-list)・
 * 違うか(not-item)と、自治体が決まらなかったときの当てはまる slug、理由。機械の判定より優先する
 */
const REVIEW_DECISIONS = join(CATALOG_CACHE, "review-decisions.json")
type ReviewDecision = {
  verdict: "item-list" | "not-item"
  slugs?: string[]
  format?: string
  decided_at: string
  note: string
}
const WORK = join(ROOT, "work/coverage")
/** 1ページの件数(CKAN の上限) */
const ROWS = 1000
/** 市のサイトも確かめる人口(Kaz 決定 2026-10-16) */
const OWN_SITE_POPULATION = 100_000

const POPULATION_SOURCE = {
  page: "https://www.soumu.go.jp/main_sosiki/jichi_gyousei/daityo/jinkou_jinkoudoutai-setaisuu.html",
  file: "https://www.soumu.go.jp/main_content/000892952.xlsx",
  label:
    "住民基本台帳に基づく人口、人口動態及び世帯数(総務省、令和8年1月1日現在、総計)",
  license: "公共データ利用規約(第1.0版)",
}

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf-8")) as T)
    : fallback
}
function writeJson(path: string, v: unknown) {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, JSON.stringify(v, null, 1) + "\n")
}
function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function readCatalogs(): CatalogDef[] {
  return CatalogsFileSchema.parse(
    JSON.parse(readFileSync(CATALOGS_PATH, "utf-8"))
  )
}

// ---------------------------------------------------------------- 人口

type PopulationFile = {
  source: typeof POPULATION_SOURCE
  base_date: string
  population: Record<string, number>
}

async function excelRows(body: Buffer, maxRows = 3000): Promise<string[][][]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(body as unknown as ArrayBuffer)
  return wb.worksheets.map((ws) => {
    const out: string[][] = []
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n > maxRows) return
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (c, col) => {
        cells[col - 1] = cellText(c.value).trim()
      })
      out.push(Array.from(cells, (c) => c ?? ""))
    })
    return out
  })
}

async function population() {
  const { record, body } = await politeFetch(POPULATION_SOURCE.file)
  if (!body)
    throw new Error(
      `人口の Excel を取得できません: ${record.error ?? record.status}`
    )
  const [sheet] = await excelRows(body, 3000)
  const registry = readRegistry()
  const codes = new Set(registry.map((e) => e.lg_code))
  const pop: Record<string, number> = {}
  for (const r of sheet) {
    const code = (r[0] ?? "").trim()
    const n = Number((r[5] ?? "").replace(/,/g, ""))
    if (codes.has(code) && Number.isFinite(n)) pop[code] = n
  }
  const missing = registry.filter((e) => !(e.lg_code in pop))
  if (missing.length > 0)
    throw new Error(
      `人口が無い自治体: ${missing
        .slice(0, 10)
        .map((e) => e.slug)
        .join(", ")}`
    )
  writeJson(POPULATION, {
    source: POPULATION_SOURCE,
    base_date: "2026-01-01",
    population: pop,
  })
  const big = Object.values(pop).filter((n) => n >= OWN_SITE_POPULATION).length
  console.log(
    `人口: ${Object.keys(pop).length} 自治体(${OWN_SITE_POPULATION.toLocaleString()}人以上 ${big})`
  )
}

// ---------------------------------------------------------------- カタログへの問い合わせ

type CatalogCache = {
  catalog: string
  query: string
  fq: string | null
  fetched_at: string
  /** 問い合わせの件数(応答の count) */
  count: number
  /** すべてのページを取得し、件数が合ったか */
  complete: boolean
  error: string | null
  datasets: Dataset[]
}

/**
 * カタログごとの応答のまとめ。大きい(数 MB)ので work/ に置き、コミットしない
 * (取得の記録 data/cache/catalog/fetch-log.jsonl と work/fetch/ の本体から作り直せる)
 */
const cachePath = (id: string) => join(ROOT, "work/catalog", `${id}.json`)

/** カタログのキャッシュは、差分が読みやすいようにデータセット1件を1行で書く */
function writeCatalogCache(path: string, c: CatalogCache) {
  const { datasets, ...head } = c
  const lines = datasets.map((d) => JSON.stringify(d))
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(
    path,
    `${JSON.stringify(head).slice(0, -1)},"datasets":[\n${lines.join(",\n")}\n]}\n`
  )
}

/** 探し先の q をすべて問い合わせ、データセットを合わせる(同じ ID は1つに) */
async function fetchCatalog(cat: CatalogDef): Promise<CatalogCache> {
  const queries = [cat.query ?? "", ...(cat.extraQueries ?? [])]
  const parts = []
  for (const q of queries) parts.push(await fetchQuery(cat, q))
  const byId = new Map(parts.flatMap((p) => p.datasets).map((d) => [d.id, d]))
  const failed = parts.find((p) => !p.complete)
  return {
    ...parts[0],
    query: queries.join(" | "),
    count: parts.reduce((n, p) => n + p.count, 0),
    complete: !failed,
    error: failed?.error ?? null,
    datasets: [...byId.values()],
  }
}

async function fetchQuery(
  cat: CatalogDef,
  query: string
): Promise<CatalogCache> {
  const base: CatalogCache = {
    catalog: cat.id,
    query,
    fq: cat.fq ?? null,
    fetched_at: new Date().toISOString(),
    count: 0,
    complete: false,
    error: null,
    datasets: [],
  }
  let seen = 0
  const rows = cat.rows ?? ROWS
  for (let start = 0; ; start += rows) {
    const params = new URLSearchParams({
      q: query,
      rows: String(rows),
      start: String(start),
    })
    if (cat.fq) params.set("fq", cat.fq)
    const url = `${cat.api}/package_search?${params}`
    const { record, body } = await politeFetch(url)
    if (!body || record.status !== 200)
      return {
        ...base,
        error: `${url}: ${record.error ?? `応答 ${record.status}`}`,
      }
    let json: {
      success?: boolean
      result?: { count: number; results: unknown[] }
    }
    try {
      json = JSON.parse(decodeText(body, record.content_type))
    } catch {
      return { ...base, error: `${url}: JSON ではない応答` }
    }
    if (!json.success || !json.result)
      return { ...base, error: `${url}: success でない応答` }
    base.count = json.result.count
    const page = json.result.results
    seen += page.length
    for (const p of page) {
      const ds = normalizePackage(p, cat)
      if (isGarbageRelated(ds)) base.datasets.push(ds)
    }
    if (page.length < rows || seen >= base.count) break
  }
  return { ...base, complete: seen === base.count }
}

async function fetchAll(args: string[]) {
  const only = argValue(args, "--only")
  for (const cat of readCatalogs()) {
    if (only && cat.id !== only) continue
    if (cat.kind === "manual") continue
    const res = await fetchCatalog(cat)
    writeCatalogCache(cachePath(cat.id), res)
    console.log(
      `${cat.id}: ${res.complete ? "完了" : "未完了"} 件数 ${res.count}・ごみに関係 ${res.datasets.length}${res.error ? `・失敗 ${res.error}` : ""}`
    )
  }
}

// ---------------------------------------------------------------- 集めたデータセット

type Loaded = {
  cat: CatalogDef
  cache: CatalogCache | null
  datasets: Dataset[]
}

function loadAll(idx: ReturnType<typeof indexRegistry>): Loaded[] {
  return readCatalogs().map((cat) => {
    if (cat.kind === "manual")
      return { cat, cache: null, datasets: manualDatasets(cat, idx) }
    const cache = readJson<CatalogCache | null>(cachePath(cat.id), null)
    return { cat, cache, datasets: cache?.datasets ?? [] }
  })
}

/** 対応づけの上書き(組合・広域など): catalogs.json の mappings */
function matchWithMappings(
  ds: Dataset,
  cat: CatalogDef,
  idx: ReturnType<typeof indexRegistry>
): Match[] {
  const mapped = cat.mappings?.[ds.org.title] ?? cat.mappings?.[ds.title]
  if (mapped)
    return mapped.slugs.map(
      (slug) => ({ kind: "matched", slug, by: "name" }) as Match
    )
  return [matchMunicipality(ds, cat, idx)]
}

// ---------------------------------------------------------------- ファイルを見る

type ResourceCheck = {
  checked_at: string
  sha256: string | null
  error?: string
  table?: TableCheck
}

async function peekOne(
  url: string,
  kindHint: ReturnType<typeof fileKind>
): Promise<ResourceCheck> {
  const checked_at = todayJst()
  const { record, body } = await politeFetch(url)
  if (!body || record.status !== 200)
    return {
      checked_at,
      sha256: record.sha256 ?? null,
      error: record.error ?? `応答 ${record.status}`,
    }
  const isZip = body[0] === 0x50 && body[1] === 0x4b
  try {
    if (kindHint === "excel" || isZip) {
      if (!isZip)
        return {
          checked_at,
          sha256: record.sha256,
          error: "旧 Excel(.xls)などで読めない",
        }
      const sheets = await excelRows(body)
      const checks = sheets.map((s) => analyzeTable(s))
      const table =
        checks.find((c) => c.kind === "item-list") ??
        checks.find((c) => c.kind === "unknown") ??
        checks[0]
      return { checked_at, sha256: record.sha256, table }
    }
    const text = decodeText(body, record.content_type)
    if (/^\s*<(!doctype|html)/i.test(text))
      return {
        checked_at,
        sha256: record.sha256,
        error: "表ではなく HTML が返った",
      }
    return {
      checked_at,
      sha256: record.sha256,
      table: analyzeTable(parseCsv(text).slice(0, 5000)),
    }
  } catch (e) {
    return {
      checked_at,
      sha256: record.sha256,
      error: `読めない: ${(e as Error).message.slice(0, 100)}`,
    }
  }
}

async function peek(args: string[]) {
  const limitArg = argValue(args, "--limit")
  const limit = limitArg ? Number(limitArg) : Infinity
  // 判定の規則を変えたとき: 取得済みのファイル(work/fetch/)で見出しを見直す。外には接続しない
  // (polite-fetch が記録とファイルから返す。取得できなかったファイルは取り直さない)
  const reanalyze = args.includes("--reanalyze")
  const registry = readRegistry()
  const idx = indexRegistry(registry)
  const checks = readJson<Record<string, ResourceCheck>>(RESOURCE_CHECK, {})
  const todo = new Map<string, ReturnType<typeof fileKind>>()
  for (const { cat, datasets } of loadAll(idx)) {
    for (const ds of datasets) {
      if (cat.excludeHosts?.some((h) => ds.url.includes(`//${h}/`))) continue
      const matches = matchWithMappings(ds, cat, idx)
      // 自治体が決まらないデータも、題名・説明文に市町村の名前があれば中身を見る
      if (
        matches.every((m) => m.kind === "none") &&
        namesIn(`${ds.org.title} ${ds.site ?? ""} ${ds.title} ${ds.notes}`, idx)
          .length === 0
      )
        continue
      const res = cat.kind === "manual" ? ds.resources : resourcesToPeek(ds)
      for (const r of res)
        if (reanalyze || !checks[r.url]) todo.set(r.url, fileKind(r))
    }
  }
  const jobs = [...todo].slice(0, limit)
  console.log(
    `見るファイル ${jobs.length} 件(見た ${Object.keys(checks).length} 件)`
  )
  let done = 0
  const worker = async () => {
    for (;;) {
      const job = jobs.shift()
      if (!job) return
      checks[job[0]] = await peekOne(job[0], job[1])
      if (++done % 20 === 0) {
        writeJson(RESOURCE_CHECK, checks)
        console.log(`  ${done} 件`)
      }
    }
  }
  // 取得はホストごとに1件ずつ(polite-fetch が待つ)。別のホストは並行してよい
  await Promise.all(Array.from({ length: 6 }, worker))
  writeJson(RESOURCE_CHECK, checks)
  console.log(`見たファイル: ${done} 件`)
}

// ---------------------------------------------------------------- 提案

/**
 * 市区町村のサイトの確認(人口10万以上の市はエージェントが確かめる。県の棚卸しで見つけた小さい市町も入る)。
 * found = 品目の一覧(CSV・Excel・冊子の PDF など)がある、open_license = オープンデータの表示がある、
 * unverified = サイトに接続できず確かめられなかった
 */
type OwnSiteCheck = {
  checked_at: string
  found: boolean
  url: string
  format: string
  license: string
  open_license: boolean
  unverified: boolean
  note?: string
}

/** 表のデータ(冊子の PDF・HTML ではない) */
const isTableFormat = (f: string) => /csv|xls|zip/i.test(f)

/**
 * 市のサイトの確認から台帳の提案を作る。表かオープンデータの表示がある一覧 → 確認中、
 * 表だが利用条件の表示が無い → 使える条件を確かめられない。冊子の PDF だけ(表示なし)は決まりどおり見つからない側
 */
function ownSiteEntry(
  o: OwnSiteCheck,
  today: string
): Record<string, unknown> | null {
  if (!o.found) return null
  const table = isTableFormat(o.format)
  if (!table && !o.open_license) return null
  const status = o.open_license ? "candidate" : "license"
  return {
    status,
    checked_at: today,
    evidence: [
      { label: `市区町村のサイトの品目の一覧(${o.format})`, url: o.url },
    ],
    note: `市のサイトの確認 ${o.checked_at}: ${o.format}・利用条件「${o.license}」${o.open_license ? "" : "(表示なし。原文を確かめる)"}。${o.note ?? ""}`.slice(
      0,
      500
    ),
  }
}

function propose(args: string[]) {
  const today = argValue(args, "--today") ?? todayJst()
  const registry = readRegistry()
  const coverage = readCoverage()
  const idx = indexRegistry(registry)
  const checks = readJson<Record<string, ResourceCheck>>(RESOURCE_CHECK, {})
  const pop = readJson<PopulationFile | null>(POPULATION, null)
  if (!pop) throw new Error("人口がありません(npm run sweep -- population)")
  const own = readJson<Record<string, OwnSiteCheck>>(OWN_SITE, {})
  const decisions = readJson<Record<string, ReviewDecision>>(
    REVIEW_DECISIONS,
    {}
  )
  /** 人が決めた結果で、機械の判定を置き換える */
  const decide = (v: DatasetVerdict): DatasetVerdict[] => {
    const d = decisions[v.datasetUrl]
    if (!d) return [v]
    const slugs = d.slugs ?? (v.slug ? [v.slug] : [])
    return slugs.map((slug) => ({
      ...v,
      slug,
      verdict: d.verdict,
      reason: `人が確かめた(${d.decided_at}): ${d.note}`,
      format: (d.format as DatasetVerdict["format"]) ?? v.format,
    }))
  }
  const loaded = loadAll(idx)

  // 1. データセットごとの判定(BODIK・東京都と同じページの search.ckan.jp の分は重ねない)
  const directUrls = new Set(
    loaded
      .filter((l) => l.cat.kind !== "search-ckan")
      .flatMap((l) => l.datasets.map((d) => d.url))
  )
  /**
   * 文の中の市町村の名前から slug を集める。同じ名前の自治体(南部町など)は、探し先の対象の県か、
   * 文に書かれた都道府県で絞る(絞れなければ、名前が同じ全部を要確認にする)
   */
  const slugsInText = (text: string, cat: CatalogDef): string[] => {
    const prefs = [
      ...new Set([
        ...(text.match(/北海道|東京都|京都府|大阪府|.{2,3}県/g) ?? []),
        ...(cat.prefs ?? []),
      ]),
    ]
    return namesIn(text, idx).flatMap((n) => {
      const all = idx.byName.get(n) ?? []
      const narrowed = all.filter((e) => prefs.includes(e.pref))
      return (narrowed.length > 0 ? narrowed : all).map((e) => e.slug)
    })
  }
  const verdicts: DatasetVerdict[] = []
  const gaps: Dataset[] = []
  const unmatchedReviews: { ds: Dataset; reason: string }[] = []
  for (const { cat, datasets } of loaded) {
    for (const ds of datasets) {
      if (cat.kind === "search-ckan" && directUrls.has(ds.url)) continue
      if (cat.excludeHosts?.some((h) => ds.url.includes(`//${h}/`))) continue
      if (
        cat.kind === "search-ckan" &&
        /data\.bodik\.jp|catalog\.data\.metro\.tokyo/.test(ds.url)
      )
        gaps.push(ds) // BODIK・東京都にあるのに、直接の問い合わせで拾えなかった
      const peeks: PeekResult[] = (
        cat.kind === "manual" ? ds.resources : resourcesToPeek(ds)
      ).map((r) => {
        const c = checks[r.url]
        if (!c)
          return { url: r.url, error: "まだ見ていない(npm run sweep -- peek)" }
        return { url: r.url, error: c.error, table: c.table }
      })
      for (const m of matchWithMappings(ds, cat, idx)) {
        if (m.kind === "none") {
          // 自治体が決まらないデータ: 人が決めていればそれを使う。品目の一覧らしい題名なら、説明文に出てくる
          // 市町村を要確認にする(中身を見ないまま、それらの市町村を見つからないにしない)
          const v = judgeDataset(ds, m, peeks, idx)
          if (decisions[ds.url]) {
            verdicts.push(...decide({ ...v, slug: null }))
            continue
          }
          // 中身(または題名)で品目の一覧ではないと分かったものだけ捨てる。それ以外は説明文の市町村を要確認に
          if (v.verdict === "not-item") continue
          const slugs = slugsInText(
            `${ds.org.title} ${ds.site ?? ""} ${ds.title} ${ds.notes}`,
            cat
          )
          unmatchedReviews.push({
            ds,
            reason: `自治体が決まらない品目の一覧らしいデータ(説明文の市町村 ${slugs.length})`,
          })
          for (const slug of slugs)
            verdicts.push({
              ...v,
              slug,
              verdict: "review",
              reason:
                "自治体が決まらない品目の一覧らしいデータ(説明文に名前がある)",
            })
          continue
        }
        if (m.kind === "review") {
          const v = judgeDataset(ds, m, peeks, idx)
          if (v.verdict === "not-item") continue
          if (decisions[ds.url]) {
            verdicts.push(...decide({ ...v, slug: null }))
            continue
          }
          // 組合・広域など slugs が空のときも、題名・説明文に出てくる市町村を要確認にする
          const slugs =
            m.slugs.length > 0
              ? m.slugs
              : slugsInText(
                  `${ds.org.title} ${ds.site ?? ""} ${ds.title} ${ds.notes}`,
                  cat
                )
          if (m.slugs.length === 0)
            unmatchedReviews.push({
              ds,
              reason: `${m.reason}(説明文の市町村 ${slugs.length})`,
            })
          for (const slug of slugs)
            verdicts.push({
              ...v,
              slug,
              verdict: "review",
              reason: `自治体が決まらない: ${m.reason}`,
            })
          continue
        }
        verdicts.push(...decide(judgeDataset(ds, m, peeks, idx)))
      }
    }
  }

  // 2. 自治体ごとの探し先と提案
  const sourcesFor = (
    slug: string,
    pref: string,
    population: number
  ): { sources: SourceStatus[]; catalogOnly: boolean } => {
    const sources: SourceStatus[] = []
    for (const { cat, cache } of loaded) {
      if (cat.prefs && !cat.prefs.includes(pref)) continue
      if (cat.municipality && cat.municipality !== slug) continue
      const complete =
        cat.kind === "manual" ? Boolean(cat.manual) : Boolean(cache?.complete)
      sources.push({
        id: cat.id,
        label: cat.label,
        url: cat.site,
        complete,
        checked_at:
          cat.manual?.checked_at ?? cache?.fetched_at.slice(0, 10) ?? null,
      })
    }
    // 県のカタログの棚卸しが済んでいない県の市は、見つからないにしない
    const prefDone = loaded.some(
      ({ cat }) =>
        (cat.prefs?.includes(pref) && !cat.municipality) ||
        cat.coversPrefCatalogs?.includes(pref)
    )
    if (!prefDone)
      sources.push({
        id: "pref-inventory",
        label: `${pref}のカタログの棚卸し`,
        url: "https://example.invalid/",
        complete: false,
        checked_at: null,
      })
    const catalogOnly = population < OWN_SITE_POPULATION
    if (!catalogOnly) {
      const o = own[slug]
      sources.push({
        id: "own-site",
        label: "市区町村のサイト(オープンデータ・ごみの分別のページ)",
        url: o?.url ?? "https://example.invalid/",
        complete: Boolean(o) && !o.unverified,
        checked_at: o?.checked_at ?? null,
      })
    }
    return { sources, catalogOnly }
  }

  const proposals: Proposal[] = []
  for (const e of registry) {
    if (e.status === "supported") continue
    const current = coverage[e.slug]
    const population = pop.population[e.lg_code] ?? 0
    const { sources, catalogOnly } = sourcesFor(e.slug, e.pref, population)
    const p = proposeFor(e, current, verdicts, sources, { today, catalogOnly })
    // カタログで確認中・要確認・調べ済みなら、それを優先する。それ以外で市のサイトに一覧があれば、それで書く
    const o = own[e.slug]
    const fromOwn =
      o && current.status === "unsurveyed" ? ownSiteEntry(o, today) : null
    if (
      fromOwn &&
      !["candidate", "review", "surveyed", "surveyed-review"].includes(p.bucket)
    ) {
      proposals.push({
        ...p,
        bucket: fromOwn.status as Proposal["bucket"],
        reason: `市のサイト: ${o.format}・${o.license}`,
        entry: fromOwn,
      })
    } else if (p.bucket === "no-data" && o?.found && p.entry) {
      // 冊子の PDF だけ(オープンデータの表示なし)。見つからないのまま、見た場所を根拠に足す
      const entry = p.entry as { evidence: { label: string; url?: string }[] }
      entry.evidence = [
        ...entry.evidence,
        {
          label: "市区町村のサイトの冊子(PDF など。オープンデータの表示なし)",
          url: o.url,
        },
      ]
      proposals.push(p)
    } else proposals.push(p)
  }

  // 3. 書き出し
  mkdirSync(WORK, { recursive: true })
  // 書く前の1件まるごと(before)も持たせ、書き込みの時点で状態だけでなく中身が変わっていても止める
  const writable = Object.fromEntries(
    proposals
      .filter((p) => p.entry)
      .map((p) => [
        p.slug,
        { expect: p.expect, before: coverage[p.slug] ?? null, entry: p.entry },
      ])
  )
  const out = join(WORK, `sweep-${today}.json`)
  writeJson(out, {
    generated_at: new Date().toISOString(),
    today,
    proposals: writable,
  })

  const count = (b: Proposal["bucket"]) =>
    proposals.filter((p) => p.bucket === b).length
  const name = (slug: string) => {
    const e = idx.bySlug.get(slug)
    return e ? `${e.pref}${e.name_ja}` : slug
  }
  const popOf = (slug: string) =>
    pop.population[idx.bySlug.get(slug)?.lg_code ?? ""] ?? 0
  const byPop = (a: Proposal, b: Proposal) => popOf(b.slug) - popOf(a.slug)
  const list = (b: Proposal["bucket"]) =>
    proposals
      .filter((p) => p.bucket === b)
      .sort(byPop)
      .map(
        (p) =>
          `| ${name(p.slug)} | ${popOf(p.slug).toLocaleString()} | ${p.reason.replace(/\|/g, "/")} | ${p.verdicts
            .map((v) => v.datasetUrl)
            .filter(Boolean)
            .slice(0, 2)
            .join(" ")} |`
      )
  const section = (title: string, b: Proposal["bucket"]) => [
    `## ${title}(${count(b)})`,
    "",
    "| 自治体 | 人口 | 理由 | データセット |",
    "|---|---|---|---|",
    ...list(b),
    "",
  ]
  const md = [
    `# 総当たりの結果(${today})`,
    "",
    "## 探し先",
    "",
    "| 探し先 | 状態 | 件数 | ごみに関係 |",
    "|---|---|---|---|",
    ...loaded.map(({ cat, cache, datasets }) =>
      cat.kind === "manual"
        ? `| ${cat.label} | 人が確かめた ${cat.manual?.checked_at ?? "未"} | — | ${datasets.length} |`
        : `| ${cat.label} | ${cache ? (cache.complete ? "完了" : `未完了 ${cache.error ?? ""}`) : "未取得"} | ${cache?.count ?? "—"} | ${datasets.length} |`
    ),
    "",
    "## 提案の内訳",
    "",
    `- 確認中(candidate): ${count("candidate")}`,
    `- 使える条件を確かめられない(license): ${count("license")}`,
    `- 見つからない(no-data): ${count("no-data")}`,
    `- 要確認(書かない): ${count("review")}`,
    `- 調べ終わっていない(書かない): ${count("incomplete")}`,
    `- 調べ済みで、見直し候補: ${count("surveyed-review")}`,
    "",
    ...section("確認中", "candidate"),
    ...section("使える条件を確かめられない", "license"),
    ...section("要確認", "review"),
    ...section("調べ済みで、見直し候補", "surveyed-review"),
    ...section("調べ終わっていない", "incomplete"),
    `## 自治体が決まらないデータセット(${unmatchedReviews.length})`,
    "",
    ...unmatchedReviews.map(
      ({ ds, reason }) =>
        `- ${ds.title}(${ds.org.title}・${ds.site ?? ds.catalog}): ${reason} ${ds.url}`
    ),
    "",
    `## 取りこぼし: search.ckan.jp にだけ出てきた BODIK・東京都のデータセット(${gaps.length})`,
    "",
    ...gaps.map((ds) => `- ${ds.title}(${ds.org.title}) ${ds.url}`),
    "",
  ].join("\n")
  writeFileSync(join(WORK, `sweep-${today}-report.md`), md)
  const tsv = [
    [
      "slug",
      "自治体",
      "判定",
      "理由",
      "探し先",
      "題名",
      "データセット",
      "ファイル",
      "形式",
      "ライセンス",
      "基準日",
      "行数",
    ].join("\t"),
    ...verdicts.map((v) =>
      [
        v.slug ?? "",
        v.slug ? name(v.slug) : "",
        v.verdict,
        v.reason,
        v.catalog,
        v.title,
        v.datasetUrl,
        v.resourceUrl ?? "",
        v.format ?? "",
        v.licenseLabel,
        v.dataYear ?? "",
        v.rows,
      ]
        .map((x) => String(x).replace(/[\t\n]/g, " "))
        .join("\t")
    ),
  ].join("\n")
  writeFileSync(join(WORK, `sweep-${today}-verdicts.tsv`), tsv + "\n")
  console.log(
    `提案: 確認中 ${count("candidate")}・使える条件 ${count("license")}・見つからない ${count("no-data")}・要確認 ${count("review")}・未完了 ${count("incomplete")}・見直し候補 ${count("surveyed-review")}`
  )
  console.log(`書き込める提案: ${out}`)
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  switch (cmd) {
    case "population":
      return population()
    case "fetch":
      return fetchAll(args)
    case "peek":
      return peek(args)
    case "propose":
      return propose(args)
    default:
      throw new Error(
        "使い方: npm run sweep -- population | fetch [--only ID] | peek [--limit N] | propose [--today YYYY-MM-DD]"
      )
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
