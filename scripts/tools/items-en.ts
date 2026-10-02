/**
 * 品目名の英訳を足す作業の道具(手順は .claude/skills/add-item-translations/SKILL.md)。
 *
 * 実行: npm run items-en -- todo <slug> [--limit 900]
 *         英訳が無い品目を work/items-en/<slug>.todo.tsv に書き出す
 *         (ID / 品目名 / 区分 / 注意点 / 似た品目の既存の訳 / 同じ品目名がある他市とその区分)
 *       npm run items-en -- apply <slug>
 *         work/items-en/<slug>.en.tsv(ID / 英訳 / 要確認の理由)を点検して辞書に入れる。
 *         理由が空の行は共通辞書(data/i18n/items.en.json)へ、理由がある行は自治体の辞書へ
 *       npm run items-en -- check [<slug>]
 *         英訳の付与率と、辞書の問題(当たらないキー・書き方)を出す。slug を省くと全自治体
 *       npm run items-en -- review <slug>
 *         「要確認」の一覧 work/items-en/<slug>.review.md を作る(Kaz に渡す)
 *       npm run items-en -- bump
 *         品目データが origin/main から変わった自治体の data_version を上げる
 *         (先に npm run build-data -- --all を実行しておく)
 *
 * work/ は作業用でコミットしない(.gitignore)。
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import {
  CategoriesFileSchema,
  ItemsFileSchema,
  MunicipalityMetaSchema,
  RegistryFileSchema,
  type Item,
} from "../../src/lib/schemas"
import { ADAPTERS } from "../adapters"
import { sameContent } from "../core/data-check"
import {
  createItemsEnLookup,
  findUnusedKeys,
  itemNameKey,
} from "../core/enrich"
import {
  COMMON_ITEMS_EN_PATH,
  REGISTRY_PATH,
  ROOT,
  municipalityFile,
} from "../core/paths"
import { nextDataVersion, todayJst } from "../core/update"
import {
  boilerplateSentences,
  englishProblem,
  parseWorkTsv,
  renderReview,
  shortNote,
  similarTranslations,
} from "./item-names-en"

const WORK_DIR = join(ROOT, "work/items-en")
const workFile = (slug: string, kind: "todo.tsv" | "en.tsv" | "review.md") =>
  join(WORK_DIR, `${slug}.${kind}`)

type Dict = Record<string, string>

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T
}

function readDict(path: string): Dict {
  return existsSync(path) ? readJson<Dict>(path) : {}
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf-8")
}

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

function requireSlug(slug: string | undefined): string {
  if (!slug || !(slug in ADAPTERS)) {
    throw new Error(
      `自治体を指定してください(${Object.keys(ADAPTERS).join(", ")})`
    )
  }
  return slug
}

function loadItems(slug: string): Item[] {
  return ItemsFileSchema.parse(readJson(municipalityFile(slug, "items.json")))
    .items
}

function loadCategories(slug: string) {
  const categories = CategoriesFileSchema.parse(
    readJson(municipalityFile(slug, "categories.json"))
  )
  return new Map(categories.map((c) => [c.id, c]))
}

/** いまの辞書(共通+自治体)で品目名を引く関数 */
function lookupFor(slug: string): (name: string) => string | null {
  return createItemsEnLookup(
    readDict(COMMON_ITEMS_EN_PATH),
    readDict(municipalityFile(slug, "items.en.json"))
  )
}

const noteOf = (item: Item): string =>
  item.dispositions
    .map((d) => d.note_ja ?? "")
    .filter(Boolean)
    .join(" ")

function todo(slug: string): void {
  const items = loadItems(slug)
  const categories = loadCategories(slug)
  const lookup = lookupFor(slug)
  const dict = {
    ...readDict(COMMON_ITEMS_EN_PATH),
    ...readDict(municipalityFile(slug, "items.en.json")),
  }
  const boilerplate = boilerplateSentences(items.map(noteOf))

  // 同じ品目名がある他市と、その区分の種類(共通辞書に入れた訳は他市にも付くので、同じ物か確かめる)
  const elsewhere = new Map<string, string[]>()
  for (const other of Object.keys(ADAPTERS)) {
    if (other === slug) continue
    const otherCategories = loadCategories(other)
    for (const item of loadItems(other)) {
      const kinds = item.dispositions
        .map((d) => otherCategories.get(d.category_id)?.kind ?? "?")
        .join("+")
      const key = itemNameKey(item.name_ja)
      elsewhere.set(key, [
        ...(elsewhere.get(key) ?? []),
        `${other.replace(/-city$/, "")}(${kinds})`,
      ])
    }
  }

  const limit = Number(argValue("--limit") ?? Infinity)
  const missing = items.filter((i) => lookup(i.name_ja) === null)
  const rows = missing
    .slice(0, limit)
    .map((item) =>
      [
        item.id,
        item.name_ja,
        item.dispositions
          .map((d) => categories.get(d.category_id)?.name_ja ?? d.category_id)
          .join("+"),
        shortNote(noteOf(item), boilerplate),
        similarTranslations(item.name_ja, dict).join(" ; "),
        (elsewhere.get(itemNameKey(item.name_ja)) ?? []).join(" "),
      ].join("\t")
    )
  mkdirSync(WORK_DIR, { recursive: true })
  const path = workFile(slug, "todo.tsv")
  writeFileSync(
    path,
    [
      "# ID\t品目名\t区分\t注意点\t似た品目の既存の訳\t同じ品目名がある他市(区分の種類)",
      ...rows,
    ].join("\n") + "\n",
    "utf-8"
  )
  console.log(
    `${slug}: 英訳が無い品目 ${missing.length} / ${items.length} 件。${rows.length} 件を ${relative(ROOT, path)} に書き出しました`
  )
  console.log(
    `訳は ${relative(ROOT, workFile(slug, "en.tsv"))} に「ID<TAB>英訳<TAB>要確認の理由(あれば)」で書きます`
  )
}

function readWork(slug: string) {
  const path = workFile(slug, "en.tsv")
  if (!existsSync(path)) {
    throw new Error(`${relative(ROOT, path)} がありません`)
  }
  const { rows, problems } = parseWorkTsv(readFileSync(path, "utf-8"))
  const byId = new Map(loadItems(slug).map((i) => [i.id, i]))
  for (const row of rows) {
    if (!byId.has(row.id)) problems.push(`${row.id}: この自治体に無い ID です`)
  }
  return { rows, problems, byId }
}

function apply(slug: string): void {
  const { rows, problems, byId } = readWork(slug)
  if (problems.length > 0) {
    console.error(problems.map((p) => `✗ ${p}`).join("\n"))
    throw new Error(`作業ファイルに問題が ${problems.length} 件あります`)
  }
  const common = readDict(COMMON_ITEMS_EN_PATH)
  const localPath = municipalityFile(slug, "items.en.json")
  const local = readDict(localPath)
  // 表記ゆれで同じ品目名になる既存のキーがあれば、それを使う(同じ品目のキーを増やさない)
  const keyIn = (dict: Dict, name: string): string =>
    Object.keys(dict).find((k) => itemNameKey(k) === itemNameKey(name)) ?? name
  let toCommon = 0
  let toLocal = 0
  for (const row of rows) {
    const name = byId.get(row.id)!.name_ja
    if (row.reason) {
      // 意味を補った訳は自治体の辞書だけに置く
      local[keyIn(local, name)] = row.en
      toLocal++
    } else {
      common[keyIn(common, name)] = row.en
      delete local[keyIn(local, name)]
      toCommon++
    }
  }
  writeJson(COMMON_ITEMS_EN_PATH, common)
  // 自治体の辞書は品目の並び順にそろえる
  const order = new Map(
    [...byId.values()].map((i, n) => [itemNameKey(i.name_ja), n])
  )
  const sorted = Object.fromEntries(
    Object.entries(local).sort(
      ([a], [b]) =>
        (order.get(itemNameKey(a)) ?? Infinity) -
        (order.get(itemNameKey(b)) ?? Infinity)
    )
  )
  if (Object.keys(sorted).length > 0) writeJson(localPath, sorted)
  console.log(
    `${slug}: 共通辞書へ ${toCommon} 件、自治体の辞書へ ${toLocal} 件(要確認)を入れました`
  )
}

/** 辞書の書き方の問題(値) */
function dictProblems(label: string, dict: Dict): string[] {
  return Object.entries(dict).flatMap(([key, en]) => {
    const problem = englishProblem(en)
    return problem ? [`${label}「${key}」: ${problem}`] : []
  })
}

function check(slugs: string[]): void {
  const common = readDict(COMMON_ITEMS_EN_PATH)
  const problems = dictProblems("共通辞書", common)
  for (const slug of slugs) {
    const items = loadItems(slug)
    const local = readDict(municipalityFile(slug, "items.en.json"))
    const lookup = createItemsEnLookup(common, local)
    const missing = items.filter((i) => lookup(i.name_ja) === null)
    console.log(
      `${slug}: 英訳あり ${items.length - missing.length} / ${items.length}` +
        (missing.length > 0
          ? `(無い品目の例: ${missing
              .slice(0, 3)
              .map((i) => i.name_ja)
              .join("、")})`
          : "")
    )
    problems.push(...dictProblems(`${slug} の辞書`, local))
    for (const key of findUnusedKeys(
      local,
      items.map((i) => i.name_ja)
    )) {
      problems.push(
        `${slug} の辞書「${key}」: どの品目名とも一致しません(訳が出ていません)`
      )
    }
  }
  if (problems.length > 0) {
    console.error(problems.map((p) => `✗ ${p}`).join("\n"))
    throw new Error(`辞書に問題が ${problems.length} 件あります`)
  }
  console.log("✓ 辞書の問題はありません")
}

function review(slug: string): void {
  const { rows, byId } = readWork(slug)
  const categories = loadCategories(slug)
  const boilerplate = boilerplateSentences(loadItems(slug).map(noteOf))
  const registry = RegistryFileSchema.parse(readJson(REGISTRY_PATH))
  const name = registry.find((e) => e.slug === slug)?.name_ja ?? slug
  const flagged = rows
    .filter((r) => r.reason && byId.has(r.id))
    .map((r) => {
      const item = byId.get(r.id)!
      return {
        id: r.id,
        name: item.name_ja,
        category: item.dispositions
          .map((d) => categories.get(d.category_id)?.name_ja ?? d.category_id)
          .join("+"),
        note: shortNote(noteOf(item), boilerplate),
        en: r.en,
        reason: r.reason,
      }
    })
  const path = workFile(slug, "review.md")
  writeFileSync(path, renderReview(name, flagged, rows.length), "utf-8")
  console.log(
    `${slug}: 要確認 ${flagged.length} 件(全 ${rows.length} 件)を ${relative(ROOT, path)} に書き出しました`
  )
}

/** git の特定時点のファイル内容。その時点に無ければ null */
function gitShow(ref: string, absPath: string): string | null {
  try {
    return execFileSync("git", ["show", `${ref}:${relative(ROOT, absPath)}`], {
      cwd: ROOT,
      encoding: "utf-8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return null
  }
}

function bump(): void {
  const base = argValue("--base") ?? "origin/main"
  const today = todayJst()
  for (const slug of Object.keys(ADAPTERS)) {
    const itemsPath = municipalityFile(slug, "items.json")
    const metaPath = municipalityFile(slug, "municipality.json")
    const baseItems = gitShow(base, itemsPath)
    const baseMeta = gitShow(base, metaPath)
    if (baseItems === null || baseMeta === null) continue // 新しい自治体
    const changed = !sameContent(
      ItemsFileSchema.parse(JSON.parse(baseItems)),
      ItemsFileSchema.parse(readJson(itemsPath))
    )
    const meta = readJson<Record<string, unknown>>(metaPath)
    const baseVersion = MunicipalityMetaSchema.parse(
      JSON.parse(baseMeta)
    ).data_version
    if (!changed || meta.data_version !== baseVersion) continue
    meta.data_version = nextDataVersion(baseVersion, today)
    writeJson(metaPath, meta)
    console.log(`${slug}: data_version ${baseVersion} → ${meta.data_version}`)
  }
}

function main(): void {
  const [command, slug] = process.argv.slice(2)
  if (command === "todo") todo(requireSlug(slug))
  else if (command === "apply") apply(requireSlug(slug))
  else if (command === "check") {
    check(
      slug && !slug.startsWith("--")
        ? [requireSlug(slug)]
        : Object.keys(ADAPTERS)
    )
  } else if (command === "review") review(requireSlug(slug))
  else if (command === "bump") bump()
  else {
    throw new Error(
      "使い方: npm run items-en -- <todo|apply|check|review|bump> [slug]"
    )
  }
}

try {
  main()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
