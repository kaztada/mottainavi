import { describe, expect, it } from "vitest"
import {
  checkWatch,
  detectFromCkan,
  detectFromContent,
  detectFromPage,
} from "./watch"

const PAGE = "https://www.example.lg.jp/keikaku/opendata.html"

describe("detectFromPage", () => {
  const html = `
    <p><a href="/common/200167312.csv">避難所一覧表（CSV:4KB）</a>（最終更新日：令和6年11月1日）</p>
    <p><a class="icon" href="/common/200203599.csv">ごみの分別方法一覧（CSV:66KB）</a>
       <span>（最終更新日：令和8年2月1日）</span></p>`

  it("リンクの文言でデータファイルを特定し、URL・文言・最終更新日を目印にする", () => {
    expect(detectFromPage(html, PAGE, /ごみの分別方法一覧/)).toEqual({
      fileUrl: "https://www.example.lg.jp/common/200203599.csv",
      fingerprint:
        "https://www.example.lg.jp/common/200203599.csv | ごみの分別方法一覧（CSV:66KB） | 最終更新日：令和8年2月1日",
    })
  })
  it("相対パスのリンクは掲載ページを基準に解決する", () => {
    const h = `<a href="./files/gomi_260819.xlsm">ごみの分別一覧表 (XLSM形式、187KB)</a>`
    expect(detectFromPage(h, PAGE, /分別一覧表/).fileUrl).toBe(
      "https://www.example.lg.jp/keikaku/files/gomi_260819.xlsm"
    )
  })
  it("URL が同じでも、ファイルサイズや更新日の表記が変われば目印が変わる", () => {
    const a = detectFromPage(html, PAGE, /ごみの分別方法一覧/)
    const b = detectFromPage(
      html.replace("令和8年2月1日", "令和8年10月1日"),
      PAGE,
      /ごみの分別方法一覧/
    )
    const c = detectFromPage(html.replace("66KB", "70KB"), PAGE, /ごみの分別方法一覧/)
    expect(b.fileUrl).toBe(a.fileUrl)
    expect(b.fingerprint).not.toBe(a.fingerprint)
    expect(c.fingerprint).not.toBe(a.fingerprint)
  })
  it("リンクが見つからない・複数あるときはエラー(ページの構成が変わった)", () => {
    expect(() => detectFromPage(html, PAGE, /存在しないデータ/)).toThrow(
      "見つかりません"
    )
    expect(() => detectFromPage(html, PAGE, /CSV/)).toThrow("複数")
  })
  it("同じファイルへのリンクが2か所にあっても1つとみなす", () => {
    const h = `<a href="a.pdf">分別辞典 [PDF]</a> … <a href="a.pdf">分別辞典 [PDF]</a>`
    expect(detectFromPage(h, PAGE, /分別辞典/).fileUrl).toBe(
      "https://www.example.lg.jp/keikaku/a.pdf"
    )
  })
})

describe("detectFromCkan", () => {
  const pkg = (resources: object[]) => ({ success: true, result: { resources } })
  it("いちばん新しい CSV のリソースを拾う(HTML など他の形式は無視)", () => {
    const d = detectFromCkan(
      pkg([
        { url: "https://x/old.csv", format: "CSV", last_modified: "2025-02-26T00:00:00" },
        { url: "https://x/new.csv", format: "csv", last_modified: "2026-03-26T00:00:00" },
        { url: "https://x/page.html", format: "HTML", created: "2027-01-01T00:00:00" },
      ])
    )
    expect(d).toEqual({
      fileUrl: "https://x/new.csv",
      fingerprint: "https://x/new.csv | 2026-03-26T00:00:00",
    })
  })
  it("更新日時が無ければ作成日時を使い、同じリソースの上書きも検出できる", () => {
    const a = detectFromCkan(pkg([{ url: "https://x/a.csv", format: "CSV", created: "2024-04-07" }]))
    const b = detectFromCkan(
      pkg([{ url: "https://x/a.csv", format: "CSV", created: "2024-04-07", last_modified: "2025-03-31" }])
    )
    expect(a.fingerprint).toBe("https://x/a.csv | 2024-04-07")
    expect(b.fingerprint).not.toBe(a.fingerprint)
  })
  it("format を指定すれば、その形式(Excel など)のリソースを拾う", () => {
    const resources = [
      { url: "https://x/a.csv", format: "CSV", last_modified: "2026-01-01" },
      { url: "https://x/b.xlsx", format: "XLSX", last_modified: "2025-01-07" },
    ]
    expect(detectFromCkan(pkg(resources), undefined, "XLSX").fileUrl).toBe(
      "https://x/b.xlsx"
    )
    expect(detectFromCkan(pkg(resources)).fileUrl).toBe("https://x/a.csv")
    expect(() => detectFromCkan(pkg(resources), undefined, "PDF")).toThrow(/PDF/)
  })

  it("CSV が無ければエラー", () => {
    expect(() => detectFromCkan(pkg([{ url: "https://x/a.pdf", format: "PDF" }]))).toThrow()
    expect(() => detectFromCkan({ success: false })).toThrow()
  })
})

describe("detectFromContent / checkWatch", () => {
  it("内容が同じなら同じ目印、違えば違う目印", () => {
    expect(detectFromContent("abc")).toEqual(detectFromContent("abc"))
    expect(detectFromContent("abc").fingerprint).not.toBe(
      detectFromContent("abd").fingerprint
    )
    expect(detectFromContent("abc").fileUrl).toBeNull()
  })
  it("page-content は select で選んだ部分だけを見る(ほかの部分の変更は無視)", async () => {
    const spec = {
      kind: "page-content" as const,
      pageUrl: PAGE,
      select: (html: string) => html.match(/<table>.*<\/table>/)?.[0] ?? "",
    }
    const a = await checkWatch(spec, async () => "<p>お知らせA</p><table>x</table>")
    const b = await checkWatch(spec, async () => "<p>お知らせB</p><table>x</table>")
    const c = await checkWatch(spec, async () => "<p>お知らせA</p><table>y</table>")
    expect(b.fingerprint).toBe(a.fingerprint)
    expect(c.fingerprint).not.toBe(a.fingerprint)
  })
  it("対象を1回だけ取得する", async () => {
    const urls: string[] = []
    await checkWatch(
      { kind: "page-link", pageUrl: PAGE, linkText: /分別/ },
      async (url) => {
        urls.push(url)
        return `<a href="a.csv">分別一覧</a>`
      }
    )
    expect(urls).toEqual([PAGE])
  })
})
