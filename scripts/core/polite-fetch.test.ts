import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  type CurlRunner,
  type FetchRecord,
  createFetcher,
  curlArgs,
  decodeText,
  isFetchOk,
  normalizeUrl,
  urlKey,
} from "./polite-fetch"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

type Reply =
  | {
      status: number
      body: string | Buffer
      contentType?: string
      /** 転送先(%{redirect_url}) */
      location?: string
    }
  | { fail: number; stderr?: string }

/** ネットワークに出ない取得器。curl の代わりに reply が返す中身を書き、呼ばれた URL を calls に残す */
function setup(
  reply: (url: string, n: number) => Reply,
  root = mkdtempSync(join(tmpdir(), "polite-fetch-"))
) {
  if (!dirs.includes(root)) dirs.push(root)
  const clock = { t: Date.now() }
  const sleeps: number[] = []
  const calls: string[] = []
  const argsSeen: string[][] = []
  const curl: CurlRunner = async (args) => {
    argsSeen.push(args)
    const url = args[args.length - 1]
    const out = args[args.indexOf("-o") + 1]
    calls.push(url)
    clock.t += 300 // 取得にかかる時間
    const r = reply(url, calls.length)
    if ("fail" in r) {
      throw Object.assign(new Error("Command failed: curl"), {
        code: r.fail,
        stdout: `000\n${url}\n`,
        stderr: r.stderr ?? "",
      })
    }
    writeFileSync(out, r.body)
    return `${r.status}\n${url}\n${r.contentType ?? "text/html; charset=utf-8"}\n${r.location ?? ""}`
  }
  const make = (offline = false) =>
    createFetcher({
      root,
      logPath: join(root, "data/cache/catalog/fetch-log.jsonl"),
      bodyDir: join(root, "work/fetch"),
      hostDir: join(root, "work/fetch/.hosts"),
      curl,
      now: () => clock.t,
      sleep: async (ms) => {
        sleeps.push(ms)
        clock.t += ms
        await new Promise((r) => setImmediate(r))
      },
      offline,
    })
  const logLines = () => {
    const p = join(root, "data/cache/catalog/fetch-log.jsonl")
    return existsSync(p) ? readFileSync(p, "utf-8").trim().split("\n") : []
  }
  return {
    root,
    clock,
    sleeps,
    calls,
    argsSeen,
    fetcher: make(),
    make,
    logLines,
  }
}

const ok = (body = "<p>ごみ</p>"): Reply => ({ status: 200, body })

describe("normalizeUrl / urlKey / curlArgs", () => {
  it("ホスト名を小文字にし、# 以降を落とす", () => {
    expect(normalizeUrl("HTTPS://Example.COM/a#top")).toBe(
      "https://example.com/a"
    )
    expect(normalizeUrl("https://example.com")).toBe("https://example.com/")
  })
  it("http(s) 以外は受け付けない", () => {
    expect(() => normalizeUrl("file:///etc/passwd")).toThrow()
    expect(() => normalizeUrl("ftp://example.com/")).toThrow()
    expect(() => normalizeUrl("not a url")).toThrow()
  })
  it("鍵は sha256 の先頭24文字", () => {
    expect(urlKey("https://example.com/")).toMatch(/^[0-9a-f]{24}$/)
    expect(urlKey("https://example.com/")).not.toBe(
      urlKey("https://example.com/a")
    )
  })
  it("証明書の確認を省かない。UA と上限を渡す", () => {
    const args = curlArgs("https://example.com/", "/tmp/x")
    expect(args).not.toContain("-k")
    expect(args).not.toContain("--insecure")
    expect(args).toContain(
      "mottainavi-fetch/0.1 (+https://mottainavi.kaztada.eco)"
    )
    expect(args[args.indexOf("--max-time") + 1]).toBe("60")
    expect(args[args.indexOf("--max-filesize") + 1]).toBe("30000000")
    // 転送は curl に任せず(-L なし)、呼び出し側が行き先ごとにロックを通してたどる
    expect(args.some((a) => /^-[a-zA-Z]*L/.test(a))).toBe(false)
    expect(args.join(" ")).toContain("%{redirect_url}")
    expect(args[args.length - 1]).toBe("https://example.com/")
  })
})

describe("createFetcher: 同じ URL は1回だけ", () => {
  it("2回目は記録と保存した本文を返し、curl を呼ばない", async () => {
    const s = setup(() => ok())
    const url = "https://a.example/list.csv"
    const first = await s.fetcher.fetch(url)
    expect(first.fromCache).toBe(false)
    expect(first.body?.toString("utf-8")).toBe("<p>ごみ</p>")
    expect(first.record.status).toBe(200)
    expect(first.record.file).toBe(`work/fetch/${urlKey(url)}.bin`)
    expect(first.record.size).toBe(Buffer.byteLength("<p>ごみ</p>"))
    expect(first.record.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(first.record.content_type).toBe("text/html; charset=utf-8")
    expect(existsSync(join(s.root, first.record.file!))).toBe(true)

    const second = await s.fetcher.fetch(url)
    expect(second.fromCache).toBe(true)
    expect(second.body?.toString("utf-8")).toBe("<p>ごみ</p>")
    expect(second.record).toEqual(first.record)
    expect(s.calls).toHaveLength(1)
    expect(s.logLines()).toHaveLength(1)
  })

  it("ほかのプロセス(別の取得器)が取った URL も取りに行かない", async () => {
    const s = setup(() => ok())
    await s.fetcher.fetch("https://a.example/")
    const other = s.make()
    const res = await other.fetch("https://a.example/")
    expect(res.fromCache).toBe(true)
    expect(s.calls).toHaveLength(1)
  })

  it("同じ URL を同時に頼んでも1回だけ取りに行く", async () => {
    const s = setup(() => ok())
    const [a, b] = await Promise.all([
      s.fetcher.fetch("https://a.example/"),
      s.fetcher.fetch("https://a.example/"),
    ])
    expect(s.calls).toHaveLength(1)
    expect([a.fromCache, b.fromCache].sort()).toEqual([false, true])
    expect(s.logLines()).toHaveLength(1)
  })

  it("refresh なら取り直し、記録は後の行が有効", async () => {
    const s = setup((_, n) => ok(`版${n}`))
    const url = "https://a.example/"
    await s.fetcher.fetch(url)
    const again = await s.fetcher.fetch(url, { refresh: true })
    expect(again.fromCache).toBe(false)
    expect(again.body?.toString("utf-8")).toBe("版2")
    expect(s.calls).toHaveLength(2)
    expect(s.logLines()).toHaveLength(2)
    expect(s.fetcher.readLog().get(url)?.sha256).toBe(again.record.sha256)
    const cached = await s.fetcher.fetch(url)
    expect(cached.body?.toString("utf-8")).toBe("版2")
  })

  it("本文のファイルが消えていたら取り直す", async () => {
    const s = setup(() => ok())
    const first = await s.fetcher.fetch("https://a.example/")
    rmSync(join(s.root, first.record.file!))
    const again = await s.fetcher.fetch("https://a.example/")
    expect(again.fromCache).toBe(false)
    expect(s.calls).toHaveLength(2)
  })

  it("整えると同じになる URL は同じものとして扱う", async () => {
    const s = setup(() => ok())
    await s.fetcher.fetch("https://A.example/#x")
    const res = await s.fetcher.fetch("https://a.example/")
    expect(res.fromCache).toBe(true)
    expect(s.calls).toEqual(["https://a.example/"])
  })

  it("http(s) 以外は curl を呼ばずに断る", async () => {
    const s = setup(() => ok())
    await expect(s.fetcher.fetch("file:///etc/passwd")).rejects.toThrow()
    expect(s.calls).toHaveLength(0)
  })

  it("オフラインなら記録にある URL だけ返す", async () => {
    const s = setup(() => ok())
    await s.fetcher.fetch("https://a.example/")
    const off = s.make(true)
    expect((await off.fetch("https://a.example/")).fromCache).toBe(true)
    await expect(off.fetch("https://a.example/other")).rejects.toThrow(
      /オフライン/
    )
    expect(s.calls).toHaveLength(1)
  })
})

describe("createFetcher: ホストごとの間隔とロック", () => {
  it("同じホストの2件目は 2.5 秒待つ。別のホストは待たない", async () => {
    const s = setup(() => ok())
    await s.fetcher.fetch("https://a.example/1")
    expect(s.sleeps).toEqual([])
    await s.fetcher.fetch("https://a.example/2")
    expect(s.sleeps).toEqual([2500])
    await s.fetcher.fetch("https://b.example/1")
    expect(s.sleeps).toEqual([2500])
  })

  it("前の1件の終わりから経った分だけ短く待つ。十分たっていれば待たない", async () => {
    const s = setup(() => ok())
    await s.fetcher.fetch("https://a.example/1")
    s.clock.t += 1000
    await s.fetcher.fetch("https://a.example/2")
    expect(s.sleeps).toEqual([1500])
    s.clock.t += 3000
    await s.fetcher.fetch("https://a.example/3")
    expect(s.sleeps).toEqual([1500])
  })

  it("間隔はプロセスをまたいで守る(最後に接続した時刻はファイルに書く)", async () => {
    const s = setup(() => ok())
    await s.fetcher.fetch("https://a.example/1")
    const other = s.make()
    await other.fetch("https://a.example/2")
    expect(s.sleeps).toEqual([2500])
    expect(existsSync(join(s.root, "work/fetch/.hosts/a.example.last"))).toBe(
      true
    )
  })

  it("ほかのプロセスがロックを持っているあいだは待つ", async () => {
    const s = setup(() => ok())
    const lock = join(s.root, "work/fetch/.hosts/a.example.lock")
    mkdirSync(lock, { recursive: true })
    const p = s.fetcher.fetch("https://a.example/")
    // 何回か待ったところで、ほかのプロセスがロックを外す
    while (s.sleeps.length < 3) await new Promise((r) => setImmediate(r))
    expect(s.calls).toHaveLength(0)
    rmSync(lock, { recursive: true })
    const res = await p
    expect(res.fromCache).toBe(false)
    expect(s.sleeps.slice(0, 3)).toEqual([200, 200, 200])
    expect(existsSync(lock)).toBe(false)
  })

  it("5分より古いロックは消して進む", async () => {
    const s = setup(() => ok())
    const lock = join(s.root, "work/fetch/.hosts/a.example.lock")
    mkdirSync(lock, { recursive: true })
    const old = new Date(s.clock.t - 10 * 60 * 1000)
    utimesSync(lock, old, old)
    const res = await s.fetcher.fetch("https://a.example/")
    expect(res.fromCache).toBe(false)
    expect(s.sleeps).toEqual([])
    expect(existsSync(lock)).toBe(false)
  })
})

describe("createFetcher: 失敗", () => {
  it("curl が失敗したら間をあけて1回だけ取り直し、駄目なら失敗を記録する", async () => {
    const s = setup(() => ({
      fail: 6,
      stderr: "curl: (6) Could not resolve host: a.example\n",
    }))
    const res = await s.fetcher.fetch("https://a.example/")
    expect(s.calls).toHaveLength(2)
    expect(s.sleeps).toEqual([2500])
    expect(res.fromCache).toBe(false)
    expect(res.body).toBeNull()
    expect(res.record.status).toBe(0)
    expect(res.record.file).toBeNull()
    expect(res.record.sha256).toBeNull()
    expect(res.record.error).toBe(
      "curl の終了コード 6: curl: (6) Could not resolve host: a.example"
    )
    expect(isFetchOk(res.record)).toBe(false)
    expect(s.logLines()).toHaveLength(1)
    // 書きかけのファイルを残さない
    expect(
      existsSync(
        join(s.root, "work/fetch", `${urlKey("https://a.example/")}.bin`)
      )
    ).toBe(false)

    // 次の呼び出しでは取りに行かない
    const next = await s.fetcher.fetch("https://a.example/")
    expect(next.fromCache).toBe(true)
    expect(next.record.error).toBeDefined()
    expect(s.calls).toHaveLength(2)
  })

  it("1回目が失敗して2回目が通れば、通った結果を記録する", async () => {
    const s = setup((_, n) => (n === 1 ? { fail: 28 } : ok()))
    const res = await s.fetcher.fetch("https://a.example/")
    expect(s.calls).toHaveLength(2)
    expect(isFetchOk(res.record)).toBe(true)
    expect(res.record.error).toBeUndefined()
    expect(s.logLines()).toHaveLength(1)
  })

  it("retryFailed なら失敗した URL を取り直す", async () => {
    let down = true
    const s = setup(() => (down ? { fail: 7 } : ok()))
    await s.fetcher.fetch("https://a.example/")
    expect(s.calls).toHaveLength(2)
    down = false
    const res = await s.fetcher.fetch("https://a.example/", {
      retryFailed: true,
    })
    expect(res.fromCache).toBe(false)
    expect(isFetchOk(res.record)).toBe(true)
    expect(s.calls).toHaveLength(3)
    // 通った記録があれば、retryFailed でも取りに行かない
    const again = await s.fetcher.fetch("https://a.example/", {
      retryFailed: true,
    })
    expect(again.fromCache).toBe(true)
    expect(s.calls).toHaveLength(3)
  })

  it("2xx でない応答はその場で取り直さず記録し、retryFailed の対象にする", async () => {
    const s = setup((_, n) =>
      n === 1 ? { status: 404, body: "not found" } : ok()
    )
    const res = await s.fetcher.fetch("https://a.example/")
    expect(s.calls).toHaveLength(1)
    expect(res.record.status).toBe(404)
    expect(res.body?.toString("utf-8")).toBe("not found")
    expect(isFetchOk(res.record)).toBe(false)
    expect((await s.fetcher.fetch("https://a.example/")).fromCache).toBe(true)
    expect(s.calls).toHaveLength(1)
    const retried = await s.fetcher.fetch("https://a.example/", {
      retryFailed: true,
    })
    expect(retried.record.status).toBe(200)
    expect(s.calls).toHaveLength(2)
  })
})

describe("createFetcher: 転送", () => {
  const A = "https://a.example/old"
  const B = "https://b.example/new"
  const C = "https://c.example/other"
  const moved = (location: string): Reply => ({
    status: 301,
    body: "moved",
    location,
  })
  /** A・C は B へ転送。B は呼ばれた回数つきの本文 */
  const site = (url: string, n: number): Reply =>
    url === B ? ok(`B${n}`) : moved(B)

  it("転送先も1件として記録し、元の URL には本文を写す", async () => {
    const s = setup(site)
    const res = await s.fetcher.fetch(A)
    expect(s.calls).toEqual([A, B])
    expect(res.body?.toString("utf-8")).toBe("B2")
    expect(res.record.url).toBe(A)
    expect(res.record.final_url).toBe(B)
    expect(res.record.status).toBe(200)
    expect(res.record.file).toBe(`work/fetch/${urlKey(A)}.bin`)
    const log = s.fetcher.readLog()
    expect(log.get(B)?.file).toBe(`work/fetch/${urlKey(B)}.bin`)
    expect(log.get(A)?.sha256).toBe(log.get(B)?.sha256)
    expect(readFileSync(join(s.root, res.record.file!), "utf-8")).toBe("B2")
  })

  it("転送先が取得済みなら取りに行かない(別の元の URL からでも)", async () => {
    const s = setup(site)
    await s.fetcher.fetch(A)
    const c = await s.fetcher.fetch(C)
    expect(s.calls).toEqual([A, B, C])
    expect(c.body?.toString("utf-8")).toBe("B2")
    expect(c.record.file).toBe(`work/fetch/${urlKey(C)}.bin`)
  })

  it("転送先を直接と転送経由で同時に頼んでも、転送先は1回だけ取りに行く", async () => {
    const s = setup(site)
    await Promise.all([s.fetcher.fetch(B), s.fetcher.fetch(A)])
    expect(s.calls.filter((u) => u === B)).toHaveLength(1)
  })

  it("転送先だけを取り直しても、元の URL の記録と本文は食い違わない", async () => {
    const s = setup(site)
    await s.fetcher.fetch(B)
    const a = await s.fetcher.fetch(A)
    expect(s.calls).toEqual([B, A])
    await s.fetcher.fetch(B, { refresh: true })
    const again = await s.fetcher.fetch(A)
    expect(again.fromCache).toBe(true)
    expect(again.record.sha256).toBe(a.record.sha256)
    expect(again.body?.toString("utf-8")).toBe("B1")
    expect((await s.fetcher.fetch(B)).body?.toString("utf-8")).toBe("B3")
  })

  it("ループと http(s) 以外への転送は失敗として記録する", async () => {
    const s = setup((url) =>
      url === A ? moved(B) : url === B ? moved(A) : moved("ftp://x/")
    )
    const loop = await s.fetcher.fetch(A)
    expect(loop.record.error).toMatch(/ループ/)
    expect(loop.body).toBeNull()
    expect(isFetchOk(loop.record)).toBe(false)
    const ftp = await s.fetcher.fetch(C)
    expect(ftp.record.error).toMatch(/http\(s\) 以外/)
    // ループの失敗は、たどり始めた元の URL にだけ記録する
    expect(s.fetcher.readLog().has(B)).toBe(false)
  })

  it("転送の回数の上限は元の URL の失敗にし、途中の URL には記録しない", async () => {
    const hop = (i: number) => `https://h.example/${i}`
    const s = setup((url) => {
      const i = Number(url.split("/").pop())
      return i >= 6 ? ok("終点") : moved(hop(i + 1))
    })
    const res = await s.fetcher.fetch(hop(0))
    expect(res.record.error).toMatch(/転送が5回を超えた/)
    expect(res.body).toBeNull()
    for (let i = 1; i <= 5; i++)
      expect(s.fetcher.readLog().has(hop(i))).toBe(false)
    // 途中の URL を直接取れば、上限に届かず通る
    const mid = await s.fetcher.fetch(hop(5))
    expect(mid.record.status).toBe(200)
    expect(mid.body?.toString("utf-8")).toBe("終点")
  })

  it("元の URL の refresh では、取得済みの転送先を取り直さない", async () => {
    const s = setup(site)
    await s.fetcher.fetch(A)
    await s.fetcher.fetch(A, { refresh: true })
    expect(s.calls).toEqual([A, B, A])
  })
})

describe("readLog", () => {
  const rec = (url: string, over: Partial<FetchRecord> = {}): FetchRecord => ({
    url,
    final_url: url,
    status: 200,
    content_type: "text/csv",
    fetched_at: "2026-10-16T00:00:00.000Z",
    sha256: null,
    size: 0,
    file: null,
    ...over,
  })

  it("同じ URL は最後の行が有効。壊れた行と書きかけの行は読み飛ばす", () => {
    const s = setup(() => ok())
    const log = join(s.root, "data/cache/catalog/fetch-log.jsonl")
    mkdirSync(join(s.root, "data/cache/catalog"), { recursive: true })
    writeFileSync(
      log,
      [
        JSON.stringify(rec("https://a.example/", { status: 500 })),
        "{壊れた行",
        JSON.stringify(rec("https://b.example/")),
        JSON.stringify(rec("https://a.example/", { status: 200, size: 3 })),
        JSON.stringify({ url: "https://c.example/" }), // 形が違う
      ].join("\n") +
        "\n" +
        JSON.stringify(rec("https://a.example/", { status: 404 }))
    )
    const map = s.fetcher.readLog()
    expect([...map.keys()].sort()).toEqual([
      "https://a.example/",
      "https://b.example/",
    ])
    expect(map.get("https://a.example/")?.status).toBe(200)
    expect(map.get("https://a.example/")?.size).toBe(3)

    // 書きかけだった行が書き終わったら、読み足す
    appendFileSync(log, "\n")
    expect(s.fetcher.readLog().get("https://a.example/")?.status).toBe(404)
    appendFileSync(log, JSON.stringify(rec("https://d.example/")) + "\n")
    expect(s.fetcher.readLog().size).toBe(3)
  })

  it("記録が無ければ空", () => {
    const s = setup(() => ok())
    expect(s.fetcher.readLog().size).toBe(0)
  })
})

describe("decodeText", () => {
  const SJIS_GOMI = Buffer.from([0x82, 0xb2, 0x82, 0xdd]) // 「ごみ」の Shift_JIS
  const EUC_GOMI = Buffer.from([0xa4, 0xb4, 0xa4, 0xdf]) // 「ごみ」の EUC-JP

  it("UTF-8(BOM あり・なし)", () => {
    expect(decodeText(Buffer.from("ごみ", "utf-8"), null)).toBe("ごみ")
    const bom = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("ごみ", "utf-8"),
    ])
    expect(decodeText(bom, null)).toBe("ごみ")
    expect(decodeText(bom, "text/csv; charset=UTF-8")).toBe("ごみ")
  })

  it("charset が無く UTF-8 として読めなければ Shift_JIS", () => {
    expect(decodeText(SJIS_GOMI, null)).toBe("ごみ")
    expect(decodeText(SJIS_GOMI, "text/csv")).toBe("ごみ")
  })

  it("Content-Type の charset を使う", () => {
    expect(decodeText(EUC_GOMI, "text/html; charset=EUC-JP")).toBe("ごみ")
    expect(decodeText(SJIS_GOMI, "text/csv; charset=Shift_JIS")).toBe("ごみ")
    expect(decodeText(SJIS_GOMI, 'text/html; charset="windows-31j"')).toBe(
      "ごみ"
    )
    expect(decodeText(SJIS_GOMI, "text/csv; charset=cp932")).toBe("ごみ")
  })

  it("UTF-8 と書いてあっても読めなければ、書いていないのと同じに扱う", () => {
    expect(decodeText(SJIS_GOMI, "text/csv; charset=utf-8")).toBe("ごみ")
  })

  it("charset が無ければ HTML の meta charset を見る", () => {
    const html = Buffer.concat([
      Buffer.from('<html><head><meta charset="EUC-JP"></head><body>', "latin1"),
      EUC_GOMI,
    ])
    expect(decodeText(html, "text/html")).toBe(
      '<html><head><meta charset="EUC-JP"></head><body>ごみ'
    )
  })
})
