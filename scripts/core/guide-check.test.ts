import { describe, expect, it } from "vitest"
import {
  classifyFailure,
  comparableUrl,
  findLinkTo,
  judge,
  readPage,
  phoneProblems,
  stopContexts,
  telContexts,
  type FetchOutcome,
  type WatchTarget,
} from "./guide-check"

const CITY = "www.city.a.lg.jp"
const html = (title: string, body: string) =>
  Buffer.from(`<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`)
const got = (over: Partial<FetchOutcome> = {}): FetchOutcome => ({
  status: 200,
  final_url: `https://${CITY}/gomi/`,
  content_type: "text/html; charset=utf-8",
  body: html("ごみの分け方|A市", "<h1>ごみの分け方</h1><p>A市の分別の案内です。</p>"),
  sha256: "1".repeat(64),
  ...over,
})
const guide = (over: Partial<WatchTarget> = {}): WatchTarget => ({
  slug: "a",
  role: "guide",
  url: `https://${CITY}/gomi/`,
  names: ["A市"],
  allowedHosts: [CITY],
  ...over,
})

describe("judge: 判定の表の順", () => {
  it("正常", () => {
    expect(judge(guide(), got()).verdict).toBe("ok")
  })
  it("別のホストへの転送は、本文が読めなくても誤案内の疑い(別の市へ転送されて 403 も)", () => {
    expect(judge(guide(), got({ final_url: "https://www.city.b.lg.jp/" })).verdict).toBe("suspect-redirect")
    expect(
      judge(guide(), got({ final_url: "https://www.city.b.lg.jp/", status: 403, body: null })).verdict
    ).toBe("suspect-redirect")
  })
  it("外部のサイトの最終の URL が確かめたときと違えば、同じホストでも誤案内の疑い", () => {
    const t = guide({
      url: "https://svc.example.jp/x?id=a",
      allowedHosts: [CITY, "svc.example.jp"],
      expectedFinalUrl: "https://svc.example.jp/x?id=a",
    })
    expect(judge(t, got({ final_url: "https://svc.example.jp/x?id=a" })).verdict).toBe("ok")
    expect(judge(t, got({ final_url: "https://svc.example.jp/x?id=b" })).verdict).toBe("suspect-redirect")
  })
  it("取得できない: 401・403・429・5xx・証明書の連鎖の不足・タイムアウト", () => {
    for (const status of [401, 403, 429, 500, 503])
      expect(judge(guide(), got({ status, body: null })).verdict).toBe("unreachable")
    expect(
      judge(guide(), got({ status: 0, body: null, error: "curl の終了コード 60: SSL certificate problem: unable to get local issuer certificate" })).verdict
    ).toBe("unreachable")
    expect(judge(guide(), got({ status: 0, body: null, error: "curl の終了コード 28: Operation timed out" })).verdict).toBe("unreachable")
    expect(
      judge(guide(), got({ status: 0, body: null, error: "curl の終了コード 60: SSL certificate problem: unable to get local issuer certificate" })).tlsChain
    ).toBe(true)
    expect(judge(guide(), got({ status: 503, body: null })).tlsChain).toBeUndefined()
    // 終了コード 60 でも、連鎖の不足でないもの(自己署名・有効期間の前)は人が見るものに入れる
    for (const e of ["self-signed certificate", "certificate is not yet valid"]) {
      expect(judge(guide(), got({ status: 0, body: null, error: `curl の終了コード 60: SSL certificate problem: ${e}` })).tlsChain).toBeUndefined()
    }
  })
  it("切れた: 404・410・名前の引けないホスト・証明書の期限切れ", () => {
    expect(judge(guide(), got({ status: 404, body: null })).verdict).toBe("broken")
    expect(judge(guide(), got({ status: 410, body: null })).verdict).toBe("broken")
    expect(judge(guide(), got({ status: 0, body: null, error: "curl の終了コード 6: Could not resolve host" })).verdict).toBe("broken")
    expect(
      judge(guide(), got({ status: 0, body: null, error: "curl の終了コード 60: SSL certificate problem: certificate has expired" })).verdict
    ).toBe("broken")
  })
  it("題名・見出しに停止の語があれば誤案内の疑い(本文)", () => {
    const o = got({ body: html("ごみ分別サーチ一時停止|A市", "<p>A市 ごみ</p>") })
    expect(judge(guide(), o).verdict).toBe("suspect-content")
  })
  it("200 の停止の画面は、入れたときにも見張りでも止まる(見出し)", () => {
    const o = got({ body: html("A市", "<h2>検索システムの提供を終了しました</h2><p>ごみ</p>") })
    expect(judge(guide(), o).verdict).toBe("suspect-content")
  })
  it("入れるときに人が見た見出しの停止の語は、毎月は知らせない", () => {
    const body = html("A市", "<h2>サービス休止情報</h2><p>ごみ</p>")
    const page = readPage(body.toString(), "https://x/")
    const t = guide({
      knownStopContexts: stopContexts(page.text),
      knownHeadStopContexts: stopContexts(`${page.title} ${page.headings}`),
    })
    expect(judge(t, got({ body })).verdict).toBe("ok")
  })
  it("本文に確かめた停止の告知が残っていても、題名・見出しの新しい停止の告知は知らせる", () => {
    const before = html("ごみ|A市", "<h1>ごみの分け方</h1><p>A市のごみ。ごみ分別検索は終了しました</p>")
    const page = readPage(before.toString(), "https://x/")
    const t = guide({
      knownStopContexts: stopContexts(page.text),
      knownHeadStopContexts: stopContexts(`${page.title} ${page.headings}`),
    })
    expect(judge(t, got({ body: before })).verdict).toBe("ok")
    // 本文と同じ文脈の告知が題名に出ても、本文の記録では除かない
    const after = html("A市", "<h1>ごみ分別検索は終了しました</h1><p>A市のごみ。ごみ分別検索は終了しました</p>")
    expect(judge(t, got({ body: after })).verdict).toBe("suspect-content")
  })
  it("404 でも本文の題名・見出しに停止の告知があれば、切れたより先に誤案内の疑い", () => {
    const o = got({ status: 404, body: html("A市", "<h1>検索システムの提供を終了しました</h1><p>ごみ</p>") })
    expect(judge(guide(), o).verdict).toBe("suspect-content")
    expect(judge(guide(), got({ status: 404, body: html("Not Found", "<p>ページがありません</p>") })).verdict).toBe("broken")
  })
  it("PDF に直接つなぐ導線が HTML に置き換わったら中身が変わった", () => {
    const t = guide({ url: `https://${CITY}/a.pdf`, expectedSha256: "1".repeat(64), expectPdf: true })
    expect(judge(t, got()).verdict).toBe("changed")
  })
  it("PDF の記録したハッシュが無ければ要確認", () => {
    const pdf = got({ final_url: `https://${CITY}/a.pdf`, content_type: "application/pdf", body: Buffer.from("%PDF-1.7") })
    expect(judge(guide({ url: `https://${CITY}/a.pdf` }), pdf).verdict).toBe("review")
  })
  it("電話: 番号の前後に「代表」の字があれば、書き方を問わず出さない", () => {
    const rep = (t: string, tel: string, dept: string) => phoneProblems(t, tel, dept).some((p) => p.includes("「代表」"))
    expect(rep("清掃課 電話 023-641-1212（代表）内線686", "023-641-1212", "清掃課")).toBe(true)
    // ほかの番号の見出しの「代表電話」でも出さない(どの番号の見出しかは見分けない)
    const hitachinaka = "お問い合わせ 廃棄物対策課〒312-8501 茨城県ひたちなか市東石川2丁目10番1号代表電話：029-273-0111 直通電話：029-273-2966ファクス：029-272-2435"
    expect(rep(hitachinaka, "029-273-2966", "廃棄物対策課")).toBe(true)
    // 「〇〇課代表」「〇〇課 代表」「代表的」も出さない
    const koriyama = "このページに関するお問い合わせ先 環境部ごみ減量推進課代表 〒963-8601福島県郡山市朝日一丁目23-7 西庁舎4階 Tel：024-924-2181 Fax：024-935-6790"
    expect(rep(koriyama, "024-924-2181", "ごみ減量推進課")).toBe(true)
    expect(rep("お問い合わせ先 環境部ごみ減量推進課 代表 〒963-8601 Tel：024-924-2181", "024-924-2181", "ごみ減量推進課")).toBe(true)
    expect(rep("代表的な品目を載せています。お問い合わせ 清掃課 電話 0138-51-0796", "0138-51-0796", "清掃課")).toBe(true)
    // あいだに空白があっても、全角の番号・区切りのない番号でも見る
    expect(rep("清掃課 電話 ０３－３７１５－１１１１（代 表）", "03-3715-1111", "清掃課")).toBe(true)
    expect(rep("清掃課 電話 0337151111（代表） 内線123", "03-3715-1111", "清掃課")).toBe(true)
  })
  it("電話: 番号の前後(前120字・後60字)の外の「代表」は見ない", () => {
    const far = "市役所 代表電話 06-6208-8181" + "あ".repeat(130) + "お問い合わせ 収集計画課 電話 06-6630-3259"
    expect(phoneProblems(far, "06-6630-3259", "収集計画課")).toEqual([])
    const after = "お問い合わせ 収集計画課 電話 06-6630-3259" + "い".repeat(70) + "代表電話 06-6208-8181"
    expect(phoneProblems(after, "06-6630-3259", "収集計画課")).toEqual([])
  })
  it("電話: 番号が本文に無ければ出さない", () => {
    expect(phoneProblems("お問い合わせ 清掃課 電話 044-200-2584", "044-200-2583", "清掃課")).toEqual(["本文に番号 044-200-2583 が無い"])
  })
  it("電話: 担当課の名前(最後の単位)が番号の前後に無ければ出さない", () => {
    expect(phoneProblems("問い合わせ 環境局収集計画課 電話 06-6630-3259", "06-6630-3259", "環境局 生活環境部 収集計画課")).toEqual([])
    const far = "収集計画課のページです。" + "う".repeat(130) + "電話 06-6630-3259"
    expect(phoneProblems(far, "06-6630-3259", "収集計画課")[0]).toContain("担当課の名前")
  })
  it("中身が変わった: 市の名前・ごみの語が消えた", () => {
    expect(judge(guide(), got({ body: html("お知らせ", "<p>ごみの分け方</p>") })).verdict).toBe("changed")
    expect(judge(guide(), got({ body: html("A市", "<p>観光案内</p>") })).verdict).toBe("changed")
  })
  it("本文の停止の語は、入れたときに見た文脈なら知らせず、新しい文脈だけ知らせる", () => {
    const body = html("ごみ|A市", "<p>A市のごみ。サービス休止情報</p>")
    const known = stopContexts(readPage(body.toString(), "https://x/").text)
    expect(judge(guide({ knownStopContexts: known }), got({ body })).verdict).toBe("ok")
    const fresh = html("ごみ|A市", "<p>A市のごみ。サービス休止情報。分別検索は3月で終了します</p>")
    expect(judge(guide({ knownStopContexts: known }), got({ body: fresh })).verdict).toBe("changed")
  })
  it("市のトップは、題名に市の名前があればよい(ごみの語・停止の語は見ない)", () => {
    const top = guide({ role: "top", url: `https://${CITY}/` })
    expect(judge(top, got({ body: html("A市ホームページ", "<p>サービス停止のお知らせ</p>") })).verdict).toBe("ok")
    expect(judge(top, got({ body: html("ホームページ", "<p>A市</p>") })).verdict).toBe("changed")
  })
  it("紹介元: 読めて外部のサイトへのリンクが消えたら誤案内の疑い。読めなければ取得できない", () => {
    const t = guide({ role: "linked-from", mustLinkTo: "https://svc.example.jp/x?id=a" })
    const withLink = got({ body: html("ごみ|A市", '<a href="https://svc.example.jp/x?id=a">検索</a>') })
    expect(judge(t, withLink).verdict).toBe("ok")
    expect(judge(t, got()).verdict).toBe("suspect-content")
    expect(judge(t, got({ status: 403, body: null })).verdict).toBe("unreachable")
  })
  it("資料: ページのリンクの付け替え・文言・ハッシュの変化は中身が変わった", () => {
    const doc = guide({
      role: "document",
      url: `https://${CITY}/a.pdf`,
      expectedDocumentUrl: `https://${CITY}/a.pdf`,
      expectedDocumentLinkText: "分別一覧(PDF)",
      expectedSha256: "1".repeat(64),
    })
    const pdf = got({ final_url: `https://${CITY}/a.pdf`, content_type: "application/pdf", body: Buffer.from("%PDF-1.7") })
    const page = got({ body: html("ごみ|A市", '<a href="/a.pdf">分別一覧(PDF)</a>') })
    expect(judge(doc, pdf, page).verdict).toBe("ok")
    expect(judge(doc, { ...pdf, sha256: "2".repeat(64) }, page).verdict).toBe("changed")
    expect(judge(doc, pdf, got({ body: html("ごみ|A市", '<a href="/b.pdf">分別一覧(PDF)</a>') })).verdict).toBe("changed")
    expect(judge(doc, pdf, got({ body: html("ごみ|A市", '<a href="/a.pdf">分別一覧(2027年版)</a>') })).verdict).toBe("changed")
  })
  it("PDF に直接つなぐ導線はハッシュで見る", () => {
    const t = guide({ url: `https://${CITY}/a.pdf`, expectedSha256: "1".repeat(64) })
    const pdf = got({ final_url: `https://${CITY}/a.pdf`, content_type: "application/pdf", body: Buffer.from("%PDF-1.7") })
    expect(judge(t, pdf).verdict).toBe("ok")
    expect(judge(t, { ...pdf, sha256: "3".repeat(64) }).verdict).toBe("changed")
  })
  it("どれにも当たらなければ要確認(204 など)", () => {
    expect(judge(guide(), got({ status: 204, body: null })).verdict).toBe("review")
  })
})

describe("小さな関数", () => {
  it("比べるための URL は index.html と末尾の / を同じとみなし、クエリは保つ", () => {
    expect(comparableUrl("https://A.jp/x/index.html#top")).toBe(comparableUrl("https://a.jp/x/"))
    expect(comparableUrl("https://a.jp/x?id=1")).not.toBe(comparableUrl("https://a.jp/x?id=2"))
  })
  it("ページの中のリンクを、相対の href も絶対にして探す", () => {
    const page = readPage('<a href="../doc/a.pdf"> 一覧 </a>', "https://a.jp/x/y.html")
    expect(findLinkTo(page, "https://a.jp/doc/a.pdf")).toEqual({ text: "一覧" })
  })
  it("電話番号は区切り・全角の違いを同じとみなす", () => {
    expect(telContexts("電話:０４４－２００－２５８３(直通)", "044-200-2583")).toHaveLength(1)
    expect(telContexts("電話 044(200)2583", "044-200-2583")).toHaveLength(1)
    expect(telContexts("フリーダイヤル 0120-264-057", "0120-264-057")).toHaveLength(1)
    expect(telContexts("電話 044-200-2584", "044-200-2583")).toEqual([])
  })
  it("住所の末尾の数字と電話番号をつながない", () => {
    expect(telContexts("千葉県松戸市根本387番地の5 047-366-1111", "047-366-1111")).toHaveLength(1)
  })
  it("取得の失敗の分け方", () => {
    expect(classifyFailure(got())).toBeNull()
    expect(classifyFailure(got({ status: 0, error: "curl の終了コード 51: no alternative certificate subject name" }))).toBe("broken")
    expect(classifyFailure(got({ status: 0, error: "転送が5回を超えた" }))).toBe("unreachable")
  })
})
