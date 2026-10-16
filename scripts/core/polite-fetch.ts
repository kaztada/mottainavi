/**
 * 外のサイトから1件ずつ、行儀よく取得する共通の道具。公開データの目録の見回り、エージェントの照合
 * (scripts/tools/fetch.ts)、のちのデータの入力で使う。
 *
 * 決まり(CLAUDE.md「市サイトへの fetch は1回→ローカルキャッシュ。連続アクセスしない」):
 * - 同じ URL は1回しか取りに行かない。2回目からは記録と保存した本文を返す。取り直すのは
 *   refresh: true を付けたその1件だけ
 * - 同じホストへは同時に1件まで。1件が終わってから次を始めるまで 2.5 秒以上あける。いくつかの
 *   エージェントが CLI を同時に動かしても守れるよう、プロセスをまたいで守る(ホストごとのロック用
 *   ディレクトリ=mkdir が原子的なことを使う、と最後に接続した時刻を書いたファイル。5分より古いロックは
 *   落ちたプロセスの残りとみなして消す)
 * - 取得は curl(シェルを通さない)。自治体のサイトは中間証明書が抜けていることが多く、Node の fetch では
 *   確かめられない。Mac の curl は OS の仕組みで補って確かめる。証明書の確認は省かない(-k は使わない)。
 *   http(s) 以外の URL は受け付けず、転送先も http(s) に限る
 * - curl が失敗したとき(終了コードが 0 でない、応答が無い)は、間をあけて1回だけ取り直す。それでも駄目なら
 *   失敗を記録する。失敗の記録がある URL は、次からも取りに行かない(refresh: true か retryFailed: true の
 *   ときだけ取り直す)。応答が 2xx でないとき(404 など)は取り直さず、そのまま記録する(retryFailed の対象)
 * - 本文の記録はあるのに本文のファイルが無いとき(work/ を消した、別の機械で取った)は、取っていないのと
 *   同じに扱って取りに行く
 *
 * 置き場所:
 * - 本文: work/fetch/<URL の sha256 の先頭24文字>.bin(work/ はコミットしない)
 * - 記録: data/cache/catalog/fetch-log.jsonl に1回の取得ごとに1行(追記だけ。同じ URL は最後の行が有効)
 * - ホストごとのロックと最後に接続した時刻: work/fetch/.hosts/
 *
 * ネットワークに出ずに確かめられるよう、curl・時計・待ち方を差し替えられる(createFetcher)。
 * CI など自治体サイトへ出てはいけない環境(MOTTAINAVI_OFFLINE=1)では、politeFetch は記録にある URL だけを返す。
 */
import { execFile } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  utimesSync,
} from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { promisify } from "node:util"
import { z } from "zod"
import { CACHE_DIR, ROOT } from "./paths"

// 問い合わせ先が分かる UA を名乗る(個人のメールアドレスは載せない)
export const USER_AGENT =
  "mottainavi-fetch/0.1 (+https://mottainavi.kaztada.eco)"
/** 同じホストへの、1件の終わりから次の始まりまでの間隔 */
export const MIN_INTERVAL_MS = 2500
export const DEFAULT_TIMEOUT_SEC = 60
export const DEFAULT_MAX_BYTES = 30_000_000
/** これより古いロックは、落ちたプロセスの残りとみなして消す */
const LOCK_STALE_MS = 5 * 60 * 1000
/** ロックが空くのを待つときの間隔 */
const LOCK_SPIN_MS = 200

export const FETCH_LOG_PATH = join(CACHE_DIR, "catalog/fetch-log.jsonl")
export const FETCH_BODY_DIR = join(ROOT, "work/fetch")

/** 1回の取得の記録(fetch-log.jsonl の1行) */
export const FetchRecordSchema = z.object({
  /** 取得した URL(normalizeUrl で整えたもの) */
  url: z.string(),
  /** 転送をたどった先の URL */
  final_url: z.string(),
  /** HTTP の状態コード。接続できなかったときは 0 */
  status: z.number().int(),
  content_type: z.string().nullable(),
  fetched_at: z.string(),
  /** 本文の sha256(本文が無いときは null) */
  sha256: z.string().nullable(),
  size: z.number().int().nonnegative(),
  /** 本文のファイル(リポジトリの根からの相対パス。本文が無いときは null) */
  file: z.string().nullable(),
  /** curl が失敗したときの中身 */
  error: z.string().optional(),
})
export type FetchRecord = z.infer<typeof FetchRecordSchema>

/**
 * curl を1回動かして、-w の出力(標準出力)を返す。終了コードが 0 でないときは、
 * execFile と同じく code(終了コード)・stdout・stderr を持つエラーで失敗する
 */
export type CurlRunner = (args: string[], timeoutMs: number) => Promise<string>

export type FetchOptions = {
  /** 記録があっても取り直す(その1件だけ) */
  refresh?: boolean
  /** 失敗の記録(curl の失敗・2xx でない応答)がある URL を取り直す */
  retryFailed?: boolean
  /** curl の --max-time(秒) */
  timeoutSec?: number
  /** curl の --max-filesize(バイト) */
  maxBytes?: number
}

export type FetchResult = {
  record: FetchRecord
  body: Buffer | null
  /** 取りに行かず、記録と保存した本文を返したか */
  fromCache: boolean
}

export type Fetcher = {
  fetch(url: string, opts?: FetchOptions): Promise<FetchResult>
  /** 記録を URL ごとに(同じ URL は最後の行が有効) */
  readLog(): Map<string, FetchRecord>
}

export type FetcherConfig = {
  /** 記録の file(相対パス)の基準 */
  root: string
  logPath: string
  bodyDir: string
  /** ホストごとのロックと最後に接続した時刻の置き場所 */
  hostDir: string
  minIntervalMs?: number
  curl?: CurlRunner
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** true なら取りに行かない(記録に無い URL はエラー) */
  offline?: boolean
}

const execFileAsync = promisify(execFile)

/** 本物の curl。--max-time より少し長く待っても終わらなければ止める */
export const realCurl: CurlRunner = async (args, timeoutMs) => {
  const { stdout } = await execFileAsync("curl", args, {
    maxBuffer: 1_000_000,
    timeout: timeoutMs + 30_000,
  })
  return stdout
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** 取得できたか(curl が通り、応答が 2xx) */
export function isFetchOk(record: FetchRecord): boolean {
  return !record.error && record.status >= 200 && record.status < 300
}

/** 記録の鍵にする形に URL を整える(http(s) だけ。# 以降はサーバーに送られないので落とす) */
export function normalizeUrl(url: string): string {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new Error(`URL の形ではありません: ${url}`)
  }
  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new Error(`http(s) の URL だけを取得します: ${url}`)
  u.hash = ""
  return u.href
}

/** 本文のファイル名にする鍵(URL の sha256 の先頭24文字) */
export function urlKey(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 24)
}

/** ロックと時刻のファイル名にするホスト名 */
function hostKey(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/[^a-z0-9.-]/g, "_")
}

/** curl に渡す引数(証明書の確認は省かない。-k は付けない) */
/** たどる転送の回数の上限 */
const MAX_REDIRECTS = 5

export function curlArgs(
  url: string,
  outPath: string,
  timeoutSec = DEFAULT_TIMEOUT_SEC,
  maxBytes = DEFAULT_MAX_BYTES
): string[] {
  // 転送は curl に任せない(-L を付けない)。転送先のホストにも同時1件・間をあける決まりを当てるため、
  // 呼び出し側が %{redirect_url} を見て1回ずつたどる
  return [
    "-sS",
    "--proto",
    "=http,https",
    "--max-time",
    String(timeoutSec),
    "--max-filesize",
    String(maxBytes),
    "-A",
    USER_AGENT,
    "-o",
    outPath,
    "-w",
    "%{http_code}\\n%{url_effective}\\n%{content_type}\\n%{redirect_url}",
    url,
  ]
}

/** curl の失敗を1行の文にする */
function curlErrorMessage(e: unknown): string {
  const err = e as { code?: unknown; signal?: unknown; stderr?: unknown }
  const stderr =
    typeof err.stderr === "string"
      ? err.stderr.trim().split("\n")[0].slice(0, 200)
      : ""
  if (typeof err.code === "number")
    return `curl の終了コード ${err.code}${stderr ? `: ${stderr}` : ""}`
  if (err.signal)
    return `curl が止められました(${String(err.signal)}。時間切れ)`
  const msg = e instanceof Error ? e.message : String(e)
  return msg.split("\n")[0].slice(0, 200)
}

/** 記録(追記だけのファイル)を読む。前に読んだところから先だけを読み足す */
function createLogReader(logPath: string) {
  let offset = 0
  let ino = -1
  let map = new Map<string, FetchRecord>()
  return (): Map<string, FetchRecord> => {
    if (!existsSync(logPath)) {
      offset = 0
      map = new Map()
      return map
    }
    const st = statSync(logPath)
    // 置き換えられた・短くなったときは最初から読み直す
    if (st.ino !== ino || st.size < offset) {
      offset = 0
      ino = st.ino
      map = new Map()
    }
    if (st.size <= offset) return map
    const buf = Buffer.alloc(st.size - offset)
    const fd = openSync(logPath, "r")
    try {
      let got = 0
      while (got < buf.length) {
        const n = readSync(fd, buf, got, buf.length - got, offset + got)
        if (n === 0) break
        got += n
      }
    } finally {
      closeSync(fd)
    }
    // 書きかけの最後の行(改行がまだ無い)は次に回す
    const end = buf.lastIndexOf(0x0a)
    if (end < 0) return map
    for (const line of buf.subarray(0, end).toString("utf-8").split("\n")) {
      if (!line.trim()) continue
      try {
        const parsed = FetchRecordSchema.safeParse(JSON.parse(line))
        if (parsed.success) map.set(parsed.data.url, parsed.data)
      } catch {
        // 壊れた行は読み飛ばす
      }
    }
    offset += end + 1
    return map
  }
}

export function createFetcher(config: FetcherConfig): Fetcher {
  const {
    root,
    logPath,
    bodyDir,
    hostDir,
    minIntervalMs = MIN_INTERVAL_MS,
    curl = realCurl,
    now = Date.now,
    sleep = defaultSleep,
    offline = false,
  } = config
  const syncLog = createLogReader(logPath)

  const readBody = (record: FetchRecord): Buffer | null => {
    if (!record.file) return null
    const path = join(root, record.file)
    return existsSync(path) ? readFileSync(path) : null
  }

  /** 記録で答えられるならその結果。取りに行くべきなら null */
  const fromLog = (url: string, opts: FetchOptions): FetchResult | null => {
    const record = syncLog().get(url)
    if (!record || opts.refresh) return null
    if (!isFetchOk(record)) {
      if (opts.retryFailed) return null
      return { record, body: readBody(record), fromCache: true }
    }
    const body = readBody(record)
    // 本文のファイルが無ければ、取っていないのと同じ
    return body ? { record, body, fromCache: true } : null
  }

  /** ホストのロックを取って fn を動かす(プロセスをまたいで同時に1件) */
  const withHostLock = async <T>(
    host: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    mkdirSync(hostDir, { recursive: true })
    const lockPath = join(hostDir, `${host}.lock`)
    const ownerPath = join(lockPath, "owner")
    const token = `${process.pid}-${randomBytes(6).toString("hex")}`
    for (;;) {
      try {
        mkdirSync(lockPath)
        break
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e
      }
      try {
        if (now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
          rmSync(lockPath, { recursive: true, force: true })
          continue
        }
      } catch {
        // 調べるあいだに外れた
        continue
      }
      await sleep(LOCK_SPIN_MS)
    }
    // ロックを持っているあいだは1分ごとに時刻を更新する(5分を超える取得でも、古いとみなされて外されない)
    const beat = setInterval(() => {
      try {
        utimesSync(lockPath, new Date(), new Date())
      } catch {
        // すでに外れている
      }
    }, 60_000)
    beat.unref?.()
    try {
      writeFileSync(ownerPath, token)
      return await fn()
    } finally {
      clearInterval(beat)
      // 自分のロックのときだけ外す(古いとみなされて、ほかのプロセスに取られていたら触らない)
      try {
        if (readFileSync(ownerPath, "utf-8") === token)
          rmSync(lockPath, { recursive: true, force: true })
      } catch {
        // すでに外れている
      }
    }
  }

  const lastPathOf = (host: string) => join(hostDir, `${host}.last`)

  /** 前の1件の終わりから minIntervalMs たつまで待つ(ロックを持っているあいだに呼ぶ) */
  const waitTurn = async (host: string) => {
    let last = NaN
    try {
      last = Number(readFileSync(lastPathOf(host), "utf-8").trim())
    } catch {
      // まだ接続したことが無い
    }
    if (!Number.isFinite(last)) return
    const wait = Math.min(minIntervalMs, last + minIntervalMs - now())
    if (wait > 0) await sleep(wait)
  }

  /** curl を1回動かす。失敗(終了コードが 0 でない・応答が無い)なら failed */
  const runOnce = async (
    url: string,
    host: string,
    bodyPath: string,
    opts: FetchOptions
  ): Promise<{
    record: FetchRecord
    body: Buffer | null
    failed: boolean
    redirect: string | null
  }> => {
    await waitTurn(host)
    const tmp = `${bodyPath}.${process.pid}.${randomBytes(4).toString("hex")}.part`
    const timeoutSec = opts.timeoutSec ?? DEFAULT_TIMEOUT_SEC
    let stdout = ""
    let error: string | null = null
    try {
      stdout = await curl(
        curlArgs(url, tmp, timeoutSec, opts.maxBytes),
        timeoutSec * 1000
      )
    } catch (e) {
      // curl が無いのは、この機械の問題。失敗として記録しない
      if ((e as { code?: unknown }).code === "ENOENT") {
        rmSync(tmp, { force: true })
        throw new Error("curl が見つかりません")
      }
      error = curlErrorMessage(e)
      const out = (e as { stdout?: unknown }).stdout
      stdout = typeof out === "string" ? out : ""
    } finally {
      writeFileSync(lastPathOf(host), String(now()))
    }
    const [code, effective, contentType, redirectUrl] = stdout
      .split("\n")
      .map((s) => s.trim())
    const redirect = redirectUrl ? redirectUrl : null
    const status = Number(code) || 0
    if (!error && status === 0) error = "応答がありません(http_code 0)"
    const base = {
      url,
      final_url: effective || url,
      status,
      content_type: contentType || null,
      fetched_at: new Date(now()).toISOString(),
    }
    if (error) {
      rmSync(tmp, { force: true })
      return {
        record: { ...base, sha256: null, size: 0, file: null, error },
        body: null,
        failed: true,
        redirect: null,
      }
    }
    // 本文が空のとき curl はファイルを作らない
    if (existsSync(tmp)) renameSync(tmp, bodyPath)
    else writeFileSync(bodyPath, Buffer.alloc(0))
    const body = readFileSync(bodyPath)
    return {
      record: {
        ...base,
        sha256: createHash("sha256").update(body).digest("hex"),
        size: body.length,
        file: relative(root, bodyPath).split(sep).join("/"),
      },
      body,
      failed: false,
      redirect,
    }
  }

  const fetchOne = async (
    rawUrl: string,
    opts: FetchOptions = {}
  ): Promise<FetchResult> => {
    const url = normalizeUrl(rawUrl)
    const cached = fromLog(url, opts)
    if (cached) return cached
    if (offline)
      throw new Error(
        `オフライン実行(MOTTAINAVI_OFFLINE=1)のため取得しません。記録がありません: ${url}`
      )
    const before = JSON.stringify(syncLog().get(url) ?? null)
    mkdirSync(bodyDir, { recursive: true })
    const bodyPath = join(bodyDir, `${urlKey(url)}.bin`)
    // 元の URL ごとのロックを、転送をたどり終えて記録を書くまで持つ(同じ URL を二重に取りに行かない)
    return withHostLock(`url-${urlKey(url)}`, async () => {
      // ロックを待つあいだに、ほかの呼び出し(ほかのプロセス)が同じ URL を取っていたら、それを使う
      const latest = syncLog().get(url)
      if (latest && JSON.stringify(latest) !== before) {
        const body = readBody(latest)
        if (body || !isFetchOk(latest))
          return { record: latest, body, fromCache: true }
      }
      let hop = url
      let res: Awaited<ReturnType<typeof runOnce>> | null = null
      // 転送は1回ずつたどり、行き先ごとにそのホストのロックと待ち時間を通す
      for (let i = 0; ; i++) {
        const host = hostKey(hop)
        // 転送先がすでに取得済みなら、それを使う(同じ URL は1回だけ)
        if (i > 0) {
          const done = fromLog(hop, opts)
          if (done) {
            res = {
              record: done.record,
              body: done.body,
              failed: !isFetchOk(done.record),
              redirect: null,
            }
            break
          }
        }
        res = await withHostLock(host, async () => {
          let r = await runOnce(hop, host, bodyPath, opts)
          // 失敗したら、間をあけて1回だけ取り直す
          if (r.failed) r = await runOnce(hop, host, bodyPath, opts)
          return r
        })
        const status = res.record.status
        if (res.failed || status < 300 || status >= 400 || !res.redirect) break
        const next = new URL(res.redirect, hop)
        if (!/^https?:$/.test(next.protocol) || i >= MAX_REDIRECTS) {
          res = {
            ...res,
            record: {
              ...res.record,
              sha256: null,
              size: 0,
              file: null,
              error:
                i >= MAX_REDIRECTS
                  ? `転送が${MAX_REDIRECTS}回を超えた`
                  : "http(s) 以外への転送",
            },
            body: null,
            failed: true,
          }
          break
        }
        hop = next.href
      }
      const record = {
        ...res.record,
        url,
        final_url: res.record.final_url || hop,
      }
      mkdirSync(dirname(logPath), { recursive: true })
      appendFileSync(logPath, JSON.stringify(record) + "\n")
      return { record, body: res.body, fromCache: false }
    })
  }

  return {
    fetch: fetchOne,
    readLog: () => new Map(syncLog()),
  }
}

let defaultFetcher: Fetcher | null = null

/** リポジトリの置き場所を使う既定の取得器(読み込んだだけでは何も作らない) */
function getDefaultFetcher(): Fetcher {
  if (!defaultFetcher)
    defaultFetcher = createFetcher({
      root: ROOT,
      logPath: FETCH_LOG_PATH,
      bodyDir: FETCH_BODY_DIR,
      hostDir: join(FETCH_BODY_DIR, ".hosts"),
      offline: process.env.MOTTAINAVI_OFFLINE === "1",
    })
  return defaultFetcher
}

/** 決まりどおりに1件取得する(記録があれば取りに行かない) */
export function politeFetch(
  url: string,
  opts?: FetchOptions
): Promise<FetchResult> {
  return getDefaultFetcher().fetch(url, opts)
}

/** data/cache/catalog/fetch-log.jsonl の記録を URL ごとに */
export function readFetchLog(): Map<string, FetchRecord> {
  return getDefaultFetcher().readLog()
}

/** 文字コードの名前を TextDecoder が分かる名前にする */
function normalizeCharset(charset: string): string {
  const c = charset.toLowerCase()
  if (
    c === "cp932" ||
    c === "ms932" ||
    c === "windows-31j" ||
    c === "sjis" ||
    c === "x-sjis"
  )
    return "shift_jis"
  return c
}

/** HTML の <meta charset> を、先頭 4KB から探す */
function metaCharset(body: Buffer): string | null {
  const head = body.subarray(0, 4096).toString("latin1")
  return (
    head.match(/<meta[^>]+charset=["']?([\w.:-]+)/i)?.[1] ??
    head.match(/<meta[^>]+content=["'][^"']*charset=([\w.:-]+)/i)?.[1] ??
    null
  )
}

const tryDecode = (
  body: Buffer,
  charset: string,
  fatal: boolean
): string | null => {
  try {
    return new TextDecoder(normalizeCharset(charset), { fatal }).decode(body)
  } catch {
    return null
  }
}

/**
 * 本文を文字に直す(UTF-8(BOM あり・なし)、Shift_JIS(CP932)、EUC-JP)。
 * Content-Type に charset があればそれを使う。ただし UTF-8 と書いてあって UTF-8 として読めないとき
 * (自治体のサイトでときどきある)は、書いていないのと同じに扱う。書いていなければ UTF-8 として読めるか
 * 確かめ、読めなければ HTML の <meta charset>、それも無ければ Shift_JIS として読む
 */
export function decodeText(body: Buffer, contentType: string | null): string {
  const declared = contentType
    ?.match(/charset=["']?([\w.:-]+)/i)?.[1]
    ?.toLowerCase()
  const isUtf8 = (c: string) => c === "utf-8" || c === "utf8"
  if (declared && !isUtf8(declared)) {
    const text = tryDecode(body, declared, false)
    if (text !== null) return text
  }
  const utf8 = tryDecode(body, "utf-8", true)
  if (utf8 !== null) return utf8
  const meta = metaCharset(body)?.toLowerCase()
  if (meta && !isUtf8(meta)) {
    const text = tryDecode(body, meta, false)
    if (text !== null) return text
  }
  return new TextDecoder("shift_jis").decode(body)
}
