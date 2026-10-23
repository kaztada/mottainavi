/**
 * 別名の付け方を変えたときの影響の一覧(以前の付け方 legacy と今の付け方の比較)。
 *
 * 実行: npm run alias-impact [-- --out <ファイル>] [--base origin/main] [--exclude slug,slug]
 *   全自治体の品目名と別名辞書(共通+市)から、メモリ上で両方の付け方を計算して比べる。
 *   以前の付け方には比較元(--base。既定 origin/main)の辞書を、今の付け方には作業中の辞書を使う。
 *   データは書き換えない。出力:
 *     - 別名の総数(以前 → 今)
 *     - 「別名で見つからなくなる組」: 辞書の別名語のうち、以前は(品目名か別名で)当たる品目があったのに
 *       今は無くなる (市, 語) の一覧と、以前に当たっていた品目
 *     - 「別名で見つかるようになる組」(言い換え辞書で足した分)
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { relative } from "node:path"
import { COMMON_ALIASES_PATH, municipalityFile, ROOT } from "../core/paths"
import { ADAPTERS } from "../adapters"
import { normalizeForSearch } from "../../src/lib/search"
import { buildItemAliases, legacyItemAliases } from "../core/aliases"

type Dict = Record<string, string[]>

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf-8")) as T)
    : fallback
}

const norm = normalizeForSearch

/** 比較元(origin/main)のファイル。無ければ null */
function gitShowJson<T>(ref: string, path: string): T | null {
  try {
    return JSON.parse(
      execFileSync("git", ["show", `${ref}:${relative(ROOT, path)}`], {
        cwd: ROOT,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      })
    ) as T
  } catch {
    return null
  }
}

function main() {
  const outIdx = process.argv.indexOf("--out")
  const out = outIdx >= 0 ? process.argv[outIdx + 1] : null
  const baseIdx = process.argv.indexOf("--base")
  const base = baseIdx >= 0 ? process.argv[baseIdx + 1] : "origin/main"
  const common = readJson<Dict>(COMMON_ALIASES_PATH, {})
  const baseCommon = gitShowJson<Dict>(base, COMMON_ALIASES_PATH) ?? common
  const lines: string[] = []
  let oldTotal = 0
  let newTotal = 0
  let ruleOnlyTotal = 0
  let pairs = 0
  const lost: string[] = []
  const gained: string[] = []

  const exIdx = process.argv.indexOf("--exclude")
  const exclude = new Set(exIdx >= 0 ? process.argv[exIdx + 1].split(",") : [])
  for (const slug of Object.keys(ADAPTERS)) {
    if (exclude.has(slug)) continue
    const itemsPath = municipalityFile(slug, "items.json")
    if (!existsSync(itemsPath)) continue
    const names: string[] = readJson<{ items: { name_ja: string }[] }>(
      itemsPath,
      { items: [] }
    ).items.map((i) => i.name_ja)
    const cityPath = municipalityFile(slug, "aliases.json")
    const dict: Dict = { ...common, ...readJson<Dict>(cityPath, {}) }
    const baseDict: Dict = {
      ...baseCommon,
      ...(gitShowJson<Dict>(base, cityPath) ?? {}),
    }

    const oldAl = names.map((n) => legacyItemAliases(n, baseDict))
    const newAl = names.map((n) => buildItemAliases(n, dict))
    oldTotal += oldAl.reduce((a, l) => a + l.length, 0)
    newTotal += newAl.reduce((a, l) => a + l.length, 0)
    ruleOnlyTotal += names.reduce(
      (a, n) => a + buildItemAliases(n, baseDict).length,
      0
    )

    const words = [
      ...new Set([
        ...Object.values(dict).flat(),
        ...Object.values(baseDict).flat(),
      ]),
    ]
    const holders = (word: string, al: string[][]) => {
      const w = norm(word)
      return names.filter(
        (n, i) => norm(n).includes(w) || al[i].some((a) => norm(a) === w)
      )
    }
    for (const w of words) {
      pairs++
      const before = holders(w, oldAl)
      const after = holders(w, newAl)
      if (before.length > 0 && after.length === 0) {
        lost.push(`${slug}\t${w}\t${before.slice(0, 4).join(" / ")}`)
      } else if (before.length === 0 && after.length > 0) {
        gained.push(`${slug}\t${w}\t${after.slice(0, 4).join(" / ")}`)
      }
    }
  }

  lines.push(`別名の総数: ${oldTotal} → ${newTotal} (${newTotal - oldTotal})`)
  lines.push(
    `  うち付け方の変更だけ(辞書は以前のまま): ${oldTotal} → ${ruleOnlyTotal}`
  )
  lines.push(`(市, 別名語)の組: ${pairs}`)
  lines.push(`別名で見つからなくなる組: ${lost.length}`)
  lines.push("市\t別名語\t以前に当たっていた品目")
  lines.push(...lost)
  lines.push("")
  lines.push(`別名で見つかるようになる組: ${gained.length}`)
  lines.push("市\t別名語\t当たる品目")
  lines.push(...gained)
  const text = lines.join("\n") + "\n"
  if (out) writeFileSync(out, text)
  else process.stdout.write(text)
}

main()
