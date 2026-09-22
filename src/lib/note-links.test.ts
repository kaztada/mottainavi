import { describe, expect, it } from "vitest"
import { splitNoteLinks } from "./note-links"

describe("splitNoteLinks", () => {
  it("URL の直後の全角かっこ・句点を URL に含めない", () => {
    expect(
      splitNoteLinks("詳しくは(https://example.jp/0000000044.html))。")
    ).toEqual([
      { type: "text", value: "詳しくは(" },
      { type: "link", value: "https://example.jp/0000000044.html" },
      { type: "text", value: "))。" },
    ])
    expect(splitNoteLinks("（https://example.jp/a.html））。")).toEqual([
      { type: "text", value: "（" },
      { type: "link", value: "https://example.jp/a.html" },
      { type: "text", value: "））。" },
    ])
  })
  it("末尾の ASCII 句読点は文の区切りとして外す", () => {
    expect(splitNoteLinks("see https://example.jp/a.html.")).toEqual([
      { type: "text", value: "see " },
      { type: "link", value: "https://example.jp/a.html" },
      { type: "text", value: "." },
    ])
  })
  it("クエリ付き URL と複数 URL", () => {
    expect(
      splitNoteLinks("A https://x.jp/?a=1&b=2 と https://y.jp/b").filter(
        (p) => p.type === "link"
      )
    ).toEqual([
      { type: "link", value: "https://x.jp/?a=1&b=2" },
      { type: "link", value: "https://y.jp/b" },
    ])
  })
  it("URL が無ければ文字列1つ", () => {
    expect(splitNoteLinks("中身を使い切る")).toEqual([
      { type: "text", value: "中身を使い切る" },
    ])
  })
})
