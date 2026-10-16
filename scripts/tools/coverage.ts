/**
 * 仕分けの台帳(data/coverage.json)の道具。台帳は手で編集せず、この道具で書き換える
 * (書く前に、全国レジストリと台帳の全体を検査し、通らなければ書かない)。
 *
 * 実行: npm run coverage -- summary
 *         状態ごとの数(対応済み・入力できる・確認中・保留・使える条件を確かめられない・見つからない・未調査)
 *       npm run coverage -- sync
 *         レジストリに合わせる: 台帳に無い未対応の自治体を「未調査」で足し、対応済みになった自治体を台帳から消す
 *       npm run coverage -- set <slug> <状態> [--date 2026-10-08] [--evidence "資料名|URL"]… [--searched "場所|URL"]…
 *                               [--detail-ja "…" --detail-en "…"] [--note "…"]
 *         1件を書き換える(--evidence と --searched は何回でも。URL は省略可)。指定しなかった項目は空になる
 *       npm run coverage -- apply <file.json>
 *         { "<slug>": { 台帳の1件 }, … } の形のファイルで、まとめて書き換える(書いてある市だけを置き換える)
 *       npm run coverage -- apply-proposal <work/coverage/sweep-YYYY-MM-DD.json> [--only slug,slug]
 *         データカタログの総当たり(npm run sweep)の提案を書く。市ごとの「書く前の状態」が
 *         いまの台帳と1件でも違えば、何も書かずに止める
 *       npm run coverage -- official-url [--dry-run] [--refresh-wikidata] [--limit N]
 *         未対応で official_url が空の市区町村に、公式サイトの URL を入れる。候補は Wikidata(問い合わせ1回、
 *         data/cache/wikidata-official-sites.json)。候補ごとに1回だけ接続して確かめ(結果は
 *         data/cache/official-url-check.json。確かめ済みの候補には接続しない)、通ったものだけ入れる。
 *         すでに入っている URL は上書きしない。結果の一覧は work/coverage/official-url-report.tsv
 *
 * 状態: available(入力できる) / candidate(確認中) / hold(保留) / license(使える条件を確かめられない)
 *       / no-data(見つからない) / unsurveyed(未調査)。意味は src/lib/coverage.ts
 */
import { execFile } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import {
  COVERAGE_STATUSES,
  CoverageEntrySchema,
  assertCoverageMatchesRegistry,
  countCoverage,
  type CoverageFile,
  type CoverageStatus,
} from "../../src/lib/coverage"
import { RegistryFileSchema, type RegistryEntry } from "../../src/lib/schemas"
import { readCoverage, readRegistry, writeCoverage } from "../core/coverage-file"
import {
  candidatesFor,
  decideOfficialUrl,
  detectCharset,
  extractTitle,
  lgJpVariant,
  looksLikeMunicipalHost,
  romajiOf,
  titleMatches,
  type CandidateCheck,
  type WikidataSite,
} from "../core/official-url"
import { CACHE_DIR, REGISTRY_PATH, ROOT } from "../core/paths"

const LABELS: Record<CoverageStatus | "supported", string> = {
  supported: "対応済み",
  available: "入力できる",
  candidate: "確認中",
  hold: "保留",
  license: "使える条件を確かめられない",
  "no-data": "見つからない",
  unsurveyed: "未調査",
}

function argValues(args: string[], name: string): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name) {
      const v = args[i + 1]
      if (v === undefined || v.startsWith("--"))
        throw new Error(`${name} の値がありません`)
      out.push(v)
      i++
    }
  }
  return out
}

function argValue(args: string[], name: string): string | undefined {
  const vs = argValues(args, name)
  if (vs.length > 1) throw new Error(`${name} は1回だけ指定できます`)
  return vs[0]
}

/** "資料名|URL" または "資料名" */
function parseRef(s: string): { label: string; url?: string } {
  const i = s.lastIndexOf("|")
  if (i < 0) return { label: s.trim() }
  return { label: s.slice(0, i).trim(), url: s.slice(i + 1).trim() }
}

function summary() {
  const registry = readRegistry()
  const counts = countCoverage(readCoverage(), registry)
  console.log(`全国 ${counts.total} 市区町村`)
  console.log(`  ${LABELS.supported}: ${counts.supported}`)
  for (const s of COVERAGE_STATUSES) console.log(`  ${LABELS[s]}: ${counts[s]}`)
}

function sync() {
  const registry = readRegistry()
  let coverage: CoverageFile
  try {
    coverage = readCoverage()
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
    coverage = {}
  }
  const supported = new Set(
    registry.filter((e) => e.status === "supported").map((e) => e.slug)
  )
  const known = new Set(registry.map((e) => e.slug))
  const next: CoverageFile = {}
  const removed: string[] = []
  for (const [slug, entry] of Object.entries(coverage)) {
    if (supported.has(slug) || !known.has(slug)) removed.push(slug)
    else next[slug] = entry
  }
  let added = 0
  for (const e of registry) {
    if (e.status !== "supported" && !(e.slug in next)) {
      next[e.slug] = CoverageEntrySchema.parse({ status: "unsurveyed" })
      added++
    }
  }
  writeCoverage(next, registry)
  console.log(`台帳をレジストリに合わせました(未調査として追加 ${added} 件)`)
  for (const slug of removed)
    console.log(`  台帳から消しました: ${slug}(対応済み、またはレジストリに無い)`)
}

function set(args: string[]) {
  const [slug, status] = args
  if (!slug || !status) throw new Error("使い方: set <slug> <状態> …")
  if (!COVERAGE_STATUSES.includes(status as CoverageStatus))
    throw new Error(`状態は ${COVERAGE_STATUSES.join(" / ")} のどれか`)
  const registry = readRegistry()
  const coverage = readCoverage()
  if (!(slug in coverage))
    throw new Error(
      `${slug} は台帳にありません(対応済みか、レジストリに無い slug です)`
    )
  const rest = args.slice(2)
  coverage[slug] = CoverageEntrySchema.parse({
    status,
    checked_at: argValue(rest, "--date"),
    detail_ja: argValue(rest, "--detail-ja"),
    detail_en: argValue(rest, "--detail-en"),
    evidence: argValues(rest, "--evidence").map(parseRef),
    searched: argValues(rest, "--searched").map(parseRef),
    note: argValue(rest, "--note"),
  })
  writeCoverage(coverage, registry)
  console.log(`${slug}: ${LABELS[status as CoverageStatus]} にしました`)
}

function apply(args: string[]) {
  const [file] = args
  if (!file) throw new Error("使い方: apply <file.json>")
  const registry = readRegistry()
  const coverage = readCoverage()
  const updates = JSON.parse(readFileSync(file, "utf-8")) as Record<
    string,
    unknown
  >
  for (const [slug, raw] of Object.entries(updates)) {
    if (!(slug in coverage))
      throw new Error(
        `${slug} は台帳にありません(対応済みか、レジストリに無い slug です)`
      )
    try {
      coverage[slug] = CoverageEntrySchema.parse(raw)
    } catch (e) {
      throw new Error(`${slug} の内容が台帳の形に合いません: ${String(e)}`)
    }
  }
  writeCoverage(coverage, registry)
  console.log(`${Object.keys(updates).length} 件を書き換えました`)
}

/**
 * 総当たりの提案(npm run sweep -- propose が作る work/coverage/sweep-<日付>.json)を書く。
 * 市ごとに「書く前の状態」(expect)を持ち、いまの台帳の状態が1件でも違えば、何も書かずに止める
 * (並行作業で決めた保留などを、古い提案で戻さないため)。--only で slug を絞れる
 */
function applyProposal(args: string[]) {
  const [file] = args
  if (!file) throw new Error("使い方: apply-proposal <sweep-YYYY-MM-DD.json> [--only slug,slug]")
  const only = argValue(args, "--only")?.split(",")
  const registry = readRegistry()
  const coverage = readCoverage()
  const { proposals } = JSON.parse(readFileSync(file, "utf-8")) as {
    proposals: Record<string, { expect: string; entry: unknown }>
  }
  const targets = Object.entries(proposals).filter(([slug]) => !only || only.includes(slug))
  const stale = targets.filter(([slug, p]) => coverage[slug]?.status !== p.expect)
  if (stale.length > 0)
    throw new Error(
      `提案を作った後に台帳が変わっています(何も書いていません。npm run sweep -- propose で作り直す):\n  ${stale
        .slice(0, 20)
        .map(([slug, p]) => `${slug}: 提案のとき ${p.expect} → いま ${coverage[slug]?.status ?? "(台帳に無い)"}`)
        .join("\n  ")}`
    )
  for (const [slug, p] of targets) {
    try {
      coverage[slug] = CoverageEntrySchema.parse(p.entry)
    } catch (e) {
      throw new Error(`${slug} の提案が台帳の形に合いません: ${String(e)}`)
    }
  }
  writeCoverage(coverage, registry)
  const by: Record<string, number> = {}
  for (const [, p] of targets) {
    const st = (p.entry as { status: string }).status
    by[st] = (by[st] ?? 0) + 1
  }
  console.log(
    `${targets.length} 件を書きました(${Object.entries(by)
      .map(([k, n]) => `${LABELS[k as CoverageStatus]} ${n}`)
      .join("・")})`
  )
}

const WIKIDATA_CACHE = join(CACHE_DIR, "wikidata-official-sites.json")
const CHECK_CACHE = join(CACHE_DIR, "official-url-check.json")
const REPORT = join(ROOT, "work/coverage/official-url-report.tsv")
/** 接続元の名乗り。連絡先はサイトの URL だけ(個人のメールアドレスは入れない) */
const USER_AGENT =
  "mottainavi-official-url-check/0.1 (+https://mottainavi.kaztada.eco)"

/** Wikidata の「公式サイト」(P856)と全国地方公共団体コード(P429)を1回で取る */
async function fetchWikidata(): Promise<WikidataSite[]> {
  const query = `SELECT ?code ?site ?rank ?end WHERE {
    ?item p:P429 ?cs . ?cs ps:P429 ?code .
    ?item p:P856 ?st . ?st ps:P856 ?site ; wikibase:rank ?rank .
    OPTIONAL { ?st pq:P582 ?end }
  }`
  const url =
    "https://query.wikidata.org/sparql?query=" + encodeURIComponent(query)
  const res = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) throw new Error(`Wikidata の問い合わせに失敗: ${res.status}`)
  const json = (await res.json()) as {
    results: { bindings: Record<string, { value: string }>[] }
  }
  return json.results.bindings.map((b) => ({
    code: b.code.value,
    url: b.site.value,
    rank: b.rank.value,
    ...(b.end ? { end: b.end.value } : {}),
  }))
}

const execFileAsync = promisify(execFile)

/**
 * curl で1回だけ取得する。自治体のサイトは中間証明書が抜けていることが多く、Node の fetch では
 * 確かめられない(UNABLE_TO_VERIFY_LEAF_SIGNATURE)。Mac の curl は OS の仕組みで補って確かめる。
 * 証明書の確認は省かない(-k は使わない)
 */
async function curlGet(
  url: string
): Promise<{ status: number; finalUrl: string; contentType: string; body: Uint8Array }> {
  const dir = mkdtempSync(join(tmpdir(), "mottainavi-url-"))
  const out = join(dir, "body")
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-sL",
        "--max-redirs",
        "5",
        "--max-time",
        "20",
        "--max-filesize",
        "3000000",
        "-A",
        USER_AGENT,
        "-o",
        out,
        "-w",
        "%{http_code}\\n%{url_effective}\\n%{content_type}",
        url,
      ],
      { maxBuffer: 1_000_000 }
    )
    const [code, finalUrl, contentType] = stdout.split("\n")
    const body = existsSync(out) ? new Uint8Array(readFileSync(out)) : new Uint8Array()
    return { status: Number(code), finalUrl: finalUrl || url, contentType: contentType ?? "", body }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** 候補に1回だけ接続して、行き先・状態・題名を確かめる */
async function checkCandidate(
  candidate: string,
  entry: RegistryEntry,
  nameIsShared: boolean,
  today: string
): Promise<CandidateCheck> {
  const base: CandidateCheck = { candidate, checked_at: today, ok: false }
  try {
    const res = await curlGet(candidate)
    if (!res.status) return { ...base, reason: "接続できない" }
    const finalUrl = res.finalUrl
    const buf = res.body.slice(0, 300_000)
    const head = new TextDecoder("latin1").decode(buf.slice(0, 4096))
    let html: string
    try {
      html = new TextDecoder(detectCharset(res.contentType, head)).decode(buf)
    } catch {
      html = new TextDecoder("utf-8").decode(buf)
    }
    const title = extractTitle(html)
    const out = { ...base, final_url: finalUrl, status: res.status, title }
    const u = new URL(finalUrl)
    if (!/^https?:$/.test(u.protocol))
      return { ...out, reason: "http(s) ではない" }
    if (res.status !== 200) return { ...out, reason: `応答 ${res.status}` }
    if (!looksLikeMunicipalHost(u.hostname, romajiOf(entry.slug)))
      return { ...out, reason: `自治体のサイトらしくないホスト名: ${u.hostname}` }
    if (!title) return { ...out, reason: "題名が無い" }
    if (!titleMatches(title, entry, nameIsShared))
      return {
        ...out,
        reason: nameIsShared
          ? "題名に名前と都道府県名がそろっていない"
          : "題名に名前が無い",
      }
    return { ...out, ok: true }
  } catch (e) {
    const msg = (e as { stderr?: string; message: string }).message
    return { ...base, reason: `接続できない: ${msg.split("\n")[0].slice(0, 120)}` }
  }
}

async function officialUrl(args: string[]) {
  const dryRun = args.includes("--dry-run")
  const limitArg = argValue(args, "--limit")
  const limit = limitArg ? Number(limitArg) : Infinity
  const registry = readRegistry()
  // 台帳とレジストリが食い違っていないことを先に確かめる
  assertCoverageMatchesRegistry(readCoverage(), registry)

  let sites: WikidataSite[]
  if (existsSync(WIKIDATA_CACHE) && !args.includes("--refresh-wikidata")) {
    sites = JSON.parse(readFileSync(WIKIDATA_CACHE, "utf-8"))
  } else {
    sites = await fetchWikidata()
    writeFileSync(WIKIDATA_CACHE, JSON.stringify(sites, null, 1) + "\n")
    console.log(`Wikidata から ${sites.length} 行を取得しました`)
  }
  const checks: Record<string, CandidateCheck> = existsSync(CHECK_CACHE)
    ? JSON.parse(readFileSync(CHECK_CACHE, "utf-8"))
    : {}

  const nameCount = new Map<string, number>()
  for (const e of registry)
    nameCount.set(e.name_ja, (nameCount.get(e.name_ja) ?? 0) + 1)
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

  const targets = registry.filter(
    (e) => e.status === "unsupported" && !e.official_url
  )
  // 候補: Wikidata の候補と、それが接続できない・応答が 200 でないときに作る .lg.jp の形
  const candidatesOf = (entry: RegistryEntry): string[] => {
    const base = candidatesFor(entry.lg_code, sites)
    const out = [...base]
    for (const c of base) {
      const ch = checks[`${entry.slug} ${c}`]
      const unreachable =
        ch && !ch.ok && (ch.reason?.startsWith("接続できない") || ch.reason?.startsWith("応答"))
      const v = unreachable ? lgJpVariant(c) : null
      if (v && !out.includes(v)) out.push(v)
    }
    return out
  }
  const runChecks = async (todo: { entry: RegistryEntry; candidate: string }[]) => {
    let done = 0
    const worker = async () => {
      for (;;) {
        const job = todo.shift()
        if (!job) return
        checks[`${job.entry.slug} ${job.candidate}`] = await checkCandidate(
          job.candidate,
          job.entry,
          (nameCount.get(job.entry.name_ja) ?? 0) > 1,
          today
        )
        done++
        if (done % 100 === 0) {
          console.log(`  ${done} 件を確かめました`)
          writeFileSync(CHECK_CACHE, JSON.stringify(checks, null, 1) + "\n")
        }
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()])
    writeFileSync(CHECK_CACHE, JSON.stringify(checks, null, 1) + "\n")
  }
  // まだ確かめていない候補だけに接続する(同時に4件まで。どのサイトにも1回だけ)。
  // 1回目は Wikidata の候補、2回目はそれが届かなかった市の .lg.jp の形
  for (let pass = 1; pass <= 2; pass++) {
    const jobs: { entry: RegistryEntry; candidate: string }[] = []
    for (const entry of targets)
      for (const c of candidatesOf(entry))
        if (!checks[`${entry.slug} ${c}`]) jobs.push({ entry, candidate: c })
    const todo = jobs.slice(0, limit)
    console.log(
      `${pass}回目: 確かめる候補 ${todo.length} 件(確かめ済み ${Object.keys(checks).length} 件)`
    )
    await runChecks(todo)
  }
  // 入れる URL を決める(すでに入っている URL は対象にしない=上書きしない)
  const next = registry.map((e) => ({ ...e }))
  const rows: string[] = ["slug\t名前\t都道府県\t入れた URL\t理由・題名"]
  let adopted = 0
  for (const e of next) {
    if (e.status !== "unsupported" || e.official_url) continue
    const all = candidatesOf(e).map((c) => checks[`${e.slug} ${c}`])
    const cs = all.filter((c): c is CandidateCheck => Boolean(c))
    const { url, reason } = decideOfficialUrl(cs, all.length - cs.length)
    const title = cs.find((c) => c.ok)?.title ?? ""
    rows.push([e.slug, e.name_ja, e.pref, url ?? "", url ? title : reason].join("\t"))
    if (url) {
      e.official_url = url
      adopted++
    }
  }
  mkdirSync(join(ROOT, "work/coverage"), { recursive: true })
  writeFileSync(REPORT, rows.join("\n") + "\n")
  console.log(
    `公式サイトの URL: 入れる ${adopted} 件 / 入れない ${targets.length - adopted} 件(一覧: ${REPORT})`
  )
  if (dryRun) {
    console.log("--dry-run のため、レジストリは書き換えていません")
    return
  }
  const parsed = RegistryFileSchema.parse(next)
  writeFileSync(REGISTRY_PATH, JSON.stringify(parsed, null, 2) + "\n")
  assertCoverageMatchesRegistry(readCoverage(), parsed)
  console.log("全国レジストリ(data/municipalities.json)に書きました")
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  switch (cmd) {
    case "summary":
      return summary()
    case "sync":
      return sync()
    case "set":
      return set(args)
    case "apply-proposal":
      return applyProposal(args)
    case "apply":
      return apply(args)
    case "official-url":
      return officialUrl(args)
    default:
      console.error(
        "使い方: npm run coverage -- summary | sync | set | apply | official-url"
      )
      process.exit(1)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
