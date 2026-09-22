import type { RawDispositionRow, RawItem } from "../../core/types"
import { parseCsv } from "./csv"
import {
  CATEGORY_NAME,
  KOGATA_BOX_LABEL,
  OFFICIAL_LINK,
  resolveCategoryId,
} from "./category-map"

const EXPECTED_HEADER = [
  "ID",
  "頭文字",
  "品目名",
  "小型家電回収対象",
  "出し方",
  "出し方のポイント",
]

/** CSV 1行ぶんの生データ(列名は横浜市の表記) */
export interface YokohamaRow {
  id: string
  name: string
  kogataKaden: boolean
  label: string
  note: string
}

/**
 * ポイント欄の HTML を文章に直す。文言は変えない(誤案内リスク回避のため原文保持)。
 * - <a href="U">T</a> → T(U)  … リンク先を失わない。表示側が URL をリンク化する
 * - <br> → 改行
 * - その他のタグは除去
 */
export function htmlToText(html: string): string {
  return html
    .replace(
      /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_m, url: string, text: string) => {
        const t = text.trim()
        return t ? `${t}(${url})` : url
      }
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .trim()
}

/** CSV テキスト → 行オブジェクト(ヘッダ検証つき) */
export function readRows(csvText: string): YokohamaRow[] {
  const rows = parseCsv(csvText)
  const header = rows[0]?.map((h) => h.trim())
  if (!header || EXPECTED_HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(
      `横浜市CSVの列構成が想定と違います: ${JSON.stringify(header)}`
    )
  }
  return rows
    .slice(1)
    .filter((r) => r.length >= 5 && r[2].trim())
    .map((r) => ({
      id: r[0].trim(),
      name: r[2].trim(),
      kogataKaden: r[3].trim() === "◎",
      label: r[4].trim(),
      note: r[5] ?? "",
    }))
}

/**
 * 市の表記を残したポイント文を作る。
 * ラベルが区分名と違う(複合表記・個別指示・古紙の種別)ときは先頭に「出し方: <市の表記>。」を置く。
 * 家電リサイクルは「市では収集しません」を添える(市の「市では収集できないごみ」ページに基づく)。
 */
export function buildNote(
  label: string,
  categoryId: string | null,
  rawNote: string
): string | null {
  const body = htmlToText(rawNote)
  const parts: string[] = []
  if (categoryId === "kaden-recycle") {
    parts.push(
      "出し方: 家電リサイクル(家電リサイクル法の対象品目で、市では収集しません)。"
    )
  } else if (categoryId && CATEGORY_NAME[categoryId] !== label) {
    parts.push(`出し方: ${label}。`)
  }
  if (body) parts.push(body)
  return parts.length ? parts.join("\n") : null
}

/** CSV テキスト → 共通パイプラインの生レコード */
export function parseYokohamaCsv(csvText: string): RawItem[] {
  const items: RawItem[] = []
  for (const r of readRows(csvText)) {
    const categoryId = resolveCategoryId(r.label)
    const rows: RawDispositionRow[] = [
      {
        category_label: r.label,
        note: buildNote(r.label, categoryId, r.note),
        official_link: categoryId ? (OFFICIAL_LINK[categoryId] ?? null) : null,
      },
    ]
    if (r.kogataKaden) {
      rows.push({
        category_label: KOGATA_BOX_LABEL,
        note: "回収ボックスの投入口(30cm×15cm)に入る、電気・電池で動く製品が対象です。個人情報が含まれるものは消去してから入れてください。",
        official_link: OFFICIAL_LINK["kogata-box"],
      })
    }
    items.push({ name_ja: r.name, rows })
  }
  return items
}
