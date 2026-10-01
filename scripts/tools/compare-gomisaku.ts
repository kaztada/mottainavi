/**
 * 自治体の品目データが古くなっていないかを、市公式のネット版分別辞典「ごみサク」と照合する。
 *
 * 実行: npm run compare-gomisaku -- --code 0397 --municipality hiratsuka-city
 *       npm run compare-gomisaku -- --code 0099 --csv path/to/gomi.csv
 *   --code: ごみサクの自治体コード(https://www.gomisaku.jp/<code>/ の4桁)
 *   --municipality: 対応済みの自治体(data/municipalities/<slug>/items.json と照合)
 *   --csv: まだ入れていない自治体の CSV(「品目」「分別区分」の列を使う。UTF-8 / CP932 は自動判定)
 *   --refresh: ごみサクのデータを取り直す
 *
 * ごみサクのデータは照合に使うだけで、リポジトリには置かない(利用条件が不明のため)。
 * OS の一時フォルダに1回だけ取得する。ごみサクのほうが古いこともあるので、結果は判断材料。
 */
import { readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseCsv } from "../core/csv"
import { fetchWithCache } from "../core/fetch-cache"
import { municipalityFile } from "../core/paths"
import { toFullWidthKana } from "../core/standard-csv"
import {
  type NameLabel,
  WATCH_WORDS,
  compareWithGomisaku,
  normalizeName,
  renderCompare,
  toGomisakuItems,
} from "./gomisaku"

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

function decode(buf: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder("shift_jis").decode(buf)
  }
}

function fromCsv(path: string): NameLabel[] {
  const rows = parseCsv(decode(readFileSync(path)))
  const header = rows[0].map((h) => h.trim())
  const nameCol = header.findIndex((h) => /品目名?$/.test(h))
  const labelCol = header.findIndex((h) => /分別区分$/.test(h))
  if (nameCol < 0 || labelCol < 0) {
    throw new Error(
      `「品目」「分別区分」の列が見つかりません: ${JSON.stringify(header)}`
    )
  }
  return rows
    .slice(1)
    .filter((r) => r[nameCol]?.trim())
    .map((r) => ({
      name: toFullWidthKana(r[nameCol].trim()),
      label: (r[labelCol] ?? "").trim(),
    }))
}

function fromMunicipality(slug: string): NameLabel[] {
  const categories: { id: string; name_ja: string }[] = JSON.parse(
    readFileSync(municipalityFile(slug, "categories.json"), "utf-8")
  )
  const nameById = new Map(categories.map((c) => [c.id, c.name_ja]))
  const file: {
    items: { name_ja: string; dispositions: { category_id: string }[] }[]
  } = JSON.parse(readFileSync(municipalityFile(slug, "items.json"), "utf-8"))
  // 1品目に複数の区分があるときは1つ目で照合する
  return file.items.map((i) => ({
    name: i.name_ja,
    label: nameById.get(i.dispositions[0].category_id) ?? "",
  }))
}

async function main() {
  const code = argValue("--code")
  const slug = argValue("--municipality")
  const csv = argValue("--csv")
  if (!code || !/^\d{4}$/.test(code) || (!slug && !csv)) {
    console.error(
      "使い方: npm run compare-gomisaku -- --code <4桁> (--municipality <slug> | --csv <path>) [--refresh]"
    )
    process.exit(1)
  }
  const refresh = process.argv.includes("--refresh")
  const dir = join(tmpdir(), "mottainavi-gomisaku", code)
  const base = `https://www.gomisaku.jp/${code}/ja/`
  const dict = await fetchWithCache(
    base + "dictionary.js",
    join(dir, "dictionary.js"),
    refresh
  )
  const type = await fetchWithCache(base + "type.js", join(dir, "type.js"), refresh)
  const gomisaku = toGomisakuItems(dict.html, type.html)

  const items = csv ? fromCsv(csv) : fromMunicipality(slug as string)
  const result = compareWithGomisaku(items, gomisaku)

  const gsByName = new Map(gomisaku.map((g) => [normalizeName(g.name), g]))
  const watch = items
    .filter((i) => WATCH_WORDS.test(i.name.normalize("NFKC")))
    .map((i) => ({
      name: i.name,
      label: i.label.normalize("NFKC"),
      gomisakuType: gsByName.get(normalizeName(i.name))?.type ?? "(ごみサクに無い)",
    }))

  console.log(`# ごみサク(${code})との照合: ${csv ?? slug}`)
  console.log(`ごみサクの品目数: ${gomisaku.length}\n`)
  console.log(renderCompare(result, watch))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
