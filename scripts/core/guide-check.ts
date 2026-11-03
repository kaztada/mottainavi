/**
 * 公式への導線の確かめ(入れるとき)と見張り(月1回)の判定。ネットワークに出ない純粋な関数だけを置く
 * (取得は呼び出し側。scripts/tools/official-guides.ts と scripts/check-guides.ts)。
 *
 * 見張りの判定は上から順に当て、最初に当たったものにする(docs/tech-stack.md の導線の見張りの節):
 *   1 誤案内の疑い(転送)  本文が読めなくても分かる、行き先の食い違い
 *   2 取得できない         401・403・429・5xx・タイムアウト・証明書の連鎖の不足など(行き先は正しい)
 *   3 誤案内の疑い(本文)  本文が読めて、題名・見出しに停止の語、紹介元から外部サイトへのリンクが消えた
 *   4 切れた               404・410・名前の引けないホスト・証明書の期限切れや名前の不一致
 *   5 中身が変わった       200 だが、市の名前・ごみの語・資料のリンク・資料のハッシュなどが記録と違う
 *   6 正常
 *   7 要確認               どれにも当たらない(204 など)
 * 本文が要る判定(リンクが消えた・中身が変わった)は、本文が読めたときだけ行う。
 */
import * as cheerio from "cheerio"
import { decodeText } from "./polite-fetch"

/** 停止・終了の告知の語(題名・見出しにあれば誤案内の疑い、本文だけなら中身が変わった) */
export const STOP_WORDS = ["停止", "休止", "終了", "移行", "廃止"] as const
/** 入れるときだけ見る、古さの告知の語 */
export const OLD_WORDS = ["情報が古", "内容が古", "古い情報"] as const
/** ごみのページらしさの語(どれか1つ) */
export const GARBAGE_WORDS = ["ごみ", "ゴミ", "分別", "資源"] as const

export type FetchOutcome = {
  /** HTTP の状態コード。接続できなかったときは 0 */
  status: number
  final_url: string
  content_type: string | null
  /** curl が失敗したときの中身 */
  error?: string
  /** 本文(取れなかったときは null) */
  body: Buffer | null
  sha256: string | null
}

export type PageInfo = {
  title: string
  /** h1〜h3 の文字 */
  headings: string
  /** 本文の文字(空白を詰めたもの) */
  text: string
  /** ページの中のリンク(行き先は絶対 URL) */
  links: { href: string; text: string }[]
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim()

/** HTML を読む(題名・見出し・本文・リンク) */
export function readPage(html: string, pageUrl: string): PageInfo {
  const $ = cheerio.load(html)
  $("script, style, noscript").remove()
  const links: { href: string; text: string }[] = []
  $("a[href]").each((_, a) => {
    const raw = $(a).attr("href") ?? ""
    try {
      const u = new URL(raw, pageUrl)
      u.hash = ""
      links.push({ href: u.href, text: squash($(a).text()) })
    } catch {
      // 壊れた href は読み飛ばす
    }
  })
  return {
    title: squash($("title").first().text()),
    headings: squash($("h1, h2, h3").text()),
    text: squash($("body").text() || $.root().text()),
    links,
  }
}

/** 本文が HTML か(Content-Type か先頭の形で見る) */
export function isHtml(o: FetchOutcome): boolean {
  if (o.content_type && /html/i.test(o.content_type)) return true
  const head = o.body?.subarray(0, 512).toString("latin1").toLowerCase() ?? ""
  return head.includes("<html") || head.includes("<!doctype html")
}

/** 本文が PDF か */
export function isPdf(o: FetchOutcome): boolean {
  if (o.content_type && /pdf/i.test(o.content_type)) return true
  return o.body?.subarray(0, 5).toString("latin1") === "%PDF-"
}

/** 比べるための URL の形(# を落とし、末尾の index.html・/ の違いを同じとみなす。クエリは保つ) */
export function comparableUrl(url: string): string {
  const u = new URL(url)
  u.hash = ""
  u.hostname = u.hostname.toLowerCase()
  u.pathname = u.pathname.replace(/\/index\.html?$/i, "/")
  if (u.pathname !== "/" && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1)
  return u.href
}

/** ページの中に、その URL へのリンクがあるか(あればリンクの文言) */
export function findLinkTo(page: PageInfo, url: string): { text: string } | null {
  const want = comparableUrl(url)
  const hit = page.links.find((l) => {
    try {
      return comparableUrl(l.href) === want
    } catch {
      return false
    }
  })
  return hit ? { text: hit.text } : null
}

export function containsAny(text: string, words: readonly string[]): string[] {
  return words.filter((w) => text.includes(w))
}

/**
 * 本文の停止の語の前後(前後12文字、空白を詰めたもの)。サイトの案内(「サービス休止情報」など)や
 * 別の事業の告知にも停止の語は出るので、入れるときに見た文脈を記録し、見張りでは新しい文脈だけを知らせる
 */
export function stopContexts(text: string): string[] {
  const flat = text.replace(/\s+/g, "")
  const out = new Set<string>()
  for (const w of STOP_WORDS) {
    let i = flat.indexOf(w)
    while (i >= 0) {
      out.add(flat.slice(Math.max(0, i - 12), i + w.length + 12))
      i = flat.indexOf(w, i + 1)
    }
  }
  return [...out].sort()
}

/** 電話番号を数字だけにする(全角の数字・いろいろなハイフン・空白を許す) */
export function telDigits(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, "")
}

/** 本文に、その電話番号があるか(区切りの違い・全角は同じとみなす) */
export function textHasTel(text: string, tel: string): boolean {
  const want = telDigits(tel)
  // 数字とハイフン類・空白の続きを拾い、数字だけにして比べる
  const runs = text.match(/[0-9０-９][0-9０-９\-‐－―ー−()（）\s]{6,20}[0-9０-９]/g) ?? []
  return runs.some((r) => telDigits(r).includes(want))
}

/** 担当課の名前の最後の単位(「環境局 生活環境部 収集計画課」→「収集計画課」)が本文にあるか */
export function textHasDept(text: string, dept: string): boolean {
  const units = dept.split(/[\s　]+/).filter(Boolean)
  const last = units[units.length - 1]
  return Boolean(last) && text.replace(/\s+/g, "").includes(last.replace(/\s+/g, ""))
}

export type FailureKind = "unreachable" | "broken" | null

/**
 * 取得の失敗を「取得できない」(行き先は正しいが、いまは読めない)と「切れた」に分ける。
 * 2xx・3xx で失敗が無ければ null
 */
export function classifyFailure(o: FetchOutcome): FailureKind {
  const err = o.error ?? ""
  if (err) {
    const code = Number(err.match(/終了コード (\d+)/)?.[1] ?? NaN)
    if (code === 6) return "broken" // 名前の引けないホスト
    if (code === 51) return "broken" // 証明書の名前の不一致
    if (code === 60 && /expired|期限/i.test(err)) return "broken"
    if (code === 60 && /subject name|does not match|no alternative/i.test(err)) return "broken"
    return "unreachable" // 証明書の連鎖の不足・タイムアウト・接続できない・転送の回数超え
  }
  if (o.status === 404 || o.status === 410) return "broken"
  if (o.status === 401 || o.status === 403 || o.status === 429) return "unreachable"
  if (o.status >= 500) return "unreachable"
  if (o.status === 0) return "unreachable"
  return null
}

export type Verdict =
  | "suspect-redirect"
  | "unreachable"
  | "suspect-content"
  | "broken"
  | "changed"
  | "ok"
  | "review"

export const VERDICT_LABELS: Record<Verdict, string> = {
  "suspect-redirect": "誤案内の疑い(転送)",
  unreachable: "取得できない",
  "suspect-content": "誤案内の疑い(本文)",
  broken: "切れた",
  changed: "中身が変わった",
  ok: "正常",
  review: "要確認",
}

/** 見張る1件の種類 */
export type WatchRole =
  | "top" // 「公式サイトを見る」の市のトップ
  | "guide" // 導線のページ
  | "document" // 導線の中の資料
  | "linked-from" // 外部サイトを案内している市のページ

export type WatchTarget = {
  slug: string
  role: WatchRole
  url: string
  /** その市の名前(同じ名前の市があれば都道府県名つき) */
  names: string[]
  /** 行き先として正しいホスト(市のホスト、外部のサイトならそのサイトのホスト) */
  allowedHosts: string[]
  /** 外部のサイトの導線: 確かめたときの最終の URL(少しでも違えば誤案内の疑い) */
  expectedFinalUrl?: string
  /** 資料: ページからのリンク先と文言、ハッシュ */
  expectedDocumentUrl?: string
  expectedDocumentLinkText?: string
  expectedSha256?: string
  /** 紹介元: このページからリンクがあるべき外部サイトの URL */
  mustLinkTo?: string
  /** 導線のページ: 入れるときに見た、本文の停止の語の文脈 */
  knownStopContexts?: string[]
}

export type Judgement = {
  verdict: Verdict
  reasons: string[]
  /** 取得できない理由が証明書の連鎖の不足(Linux の curl では補えない。手元の Mac なら確かめられる) */
  tlsChain?: boolean
}

/** 証明書の連鎖の不足か(期限切れ・名前の不一致は除く) */
export function isTlsChainError(o: FetchOutcome): boolean {
  const err = o.error ?? ""
  return /終了コード 60/.test(err) && classifyFailure(o) === "unreachable"
}

/**
 * 見張りの1件の判定。outcome はその URL を(転送をたどって)取った結果。
 * 資料(role=document)は、資料そのものの結果を outcome に、資料を載せたページの結果を page に渡す
 */
export function judge(
  t: WatchTarget,
  outcome: FetchOutcome,
  page?: FetchOutcome
): Judgement {
  const reasons: string[] = []
  const finalHost = (() => {
    try {
      return new URL(outcome.final_url).hostname.toLowerCase()
    } catch {
      return ""
    }
  })()

  // 1 誤案内の疑い(転送): 本文の取得の成否にかかわらず、行き先で分かるもの
  if (outcome.final_url && finalHost && !t.allowedHosts.includes(finalHost)) {
    return {
      verdict: "suspect-redirect",
      reasons: [`行き先が別のホストです: ${outcome.final_url}`],
    }
  }
  if (
    t.expectedFinalUrl &&
    outcome.final_url &&
    comparableUrl(outcome.final_url) !== comparableUrl(t.expectedFinalUrl)
  ) {
    return {
      verdict: "suspect-redirect",
      reasons: [
        `外部のサイトの行き先が、確かめたときと違います: ${outcome.final_url}(確かめたとき ${t.expectedFinalUrl})`,
      ],
    }
  }

  // 2 取得できない / 4 切れた(本文が読めない)
  const failure = classifyFailure(outcome)
  if (failure === "unreachable") {
    return {
      verdict: "unreachable",
      reasons: [outcome.error ?? `状態コード ${outcome.status}`],
      ...(isTlsChainError(outcome) ? { tlsChain: true } : {}),
    }
  }
  if (failure === "broken") {
    return { verdict: "broken", reasons: [outcome.error ?? `状態コード ${outcome.status}`] }
  }
  if (outcome.status !== 200 || !outcome.body) {
    return { verdict: "review", reasons: [`状態コード ${outcome.status}(本文なし)`] }
  }

  // 資料: リンクの付け替えとハッシュ
  if (t.role === "document") {
    if (page && page.body && page.status === 200 && isHtml(page) && t.expectedDocumentUrl) {
      const info = readOutcomePage(page)
      const link = info ? findLinkTo(info, t.expectedDocumentUrl) : null
      if (!link) reasons.push("ページから資料へのリンクが見つかりません")
      else if (t.expectedDocumentLinkText && link.text !== t.expectedDocumentLinkText)
        reasons.push(`資料へのリンクの文言が変わりました: ${link.text}`)
    }
    if (t.expectedSha256 && outcome.sha256 && outcome.sha256 !== t.expectedSha256)
      reasons.push("資料の中身(ハッシュ)が変わりました")
    return reasons.length > 0 ? { verdict: "changed", reasons } : { verdict: "ok", reasons }
  }

  // PDF に直接つなぐ導線は、ハッシュだけを見る
  if (isPdf(outcome)) {
    if (t.expectedSha256 && outcome.sha256 !== t.expectedSha256)
      return { verdict: "changed", reasons: ["資料の中身(ハッシュ)が変わりました"] }
    return { verdict: "ok", reasons }
  }
  if (!isHtml(outcome)) {
    return { verdict: "review", reasons: [`HTML でも PDF でもありません: ${outcome.content_type}`] }
  }

  const info = readPage(decodeText(outcome.body, outcome.content_type), outcome.final_url)
  const head = `${info.title} ${info.headings}`

  // 3 誤案内の疑い(本文)。入れるときに人が見た文脈(knownStopContexts)は知らせない
  const known = new Set(t.knownStopContexts ?? [])
  const freshContexts = stopContexts(info.text).filter((c) => !known.has(c))
  if (t.role === "guide") {
    const stop = containsAny(head, STOP_WORDS).filter(
      (w) => freshContexts.some((c) => c.includes(w)) || !info.text.includes(w)
    )
    if (stop.length > 0)
      return {
        verdict: "suspect-content",
        reasons: [`題名・見出しに停止の語があります: ${stop.join("・")}`],
      }
  }
  if (t.role === "linked-from" && t.mustLinkTo && !findLinkTo(info, t.mustLinkTo)) {
    return {
      verdict: "suspect-content",
      reasons: [`市のページから外部のサイトへのリンクが消えました: ${t.mustLinkTo}`],
    }
  }

  // 5 中身が変わった
  if (t.role === "top") {
    if (!t.names.some((n) => info.title.includes(n)))
      reasons.push("題名に市の名前がありません")
  } else {
    // 外部のサイトは、市を表すパスやクエリまで最終の URL を見ている(上の 1)ので、市の名前は求めない
    // (さんあ〜るの入口のように、ページに市の名前が無いものがある)
    if (!t.expectedFinalUrl && !t.names.some((n) => info.text.includes(n) || info.title.includes(n)))
      reasons.push("題名・本文に市の名前がありません")
    if (t.role === "guide" && containsAny(`${head} ${info.text}`, GARBAGE_WORDS).length === 0)
      reasons.push("ごみの語(ごみ・分別・資源)がありません")
    if (t.role === "guide" && freshContexts.length > 0)
      reasons.push(
        `本文に新しい停止の語の文脈があります(人が見る): ${freshContexts.slice(0, 3).join(" / ")}`
      )
  }
  return reasons.length > 0 ? { verdict: "changed", reasons } : { verdict: "ok", reasons }
}

/** 本文を文字にして読む(呼び出し側の便利のため) */
export function readOutcomePage(o: FetchOutcome): PageInfo | null {
  if (!o.body || !isHtml(o)) return null
  return readPage(decodeText(o.body, o.content_type), o.final_url)
}
