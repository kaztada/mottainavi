/**
 * 別名の変更前後(--base と作業ツリー)で、代表的な語の検索結果がどう変わるかの一覧。
 *
 * 実行: npm run search-diff [-- --base origin/main] [--out <ファイル>] [--words 語1,語2]
 *   語は既定で「別名辞書の別名語すべて+よく使う語」。各市で上位3件を比べる。
 *   データは書き換えない。出力:
 *     - 先頭が変わった組 / 以前は出ていたのに0件になる組(EMPTY) / 以前の先頭が上位3件から消える組(LOST)
 *     - 品目名・読みで引いたときに自分が先頭に出る割合(変わらないはず)
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { relative } from "node:path"
import { toSearchIndex } from "../../src/lib/public-data"
import { createSearcher, searchItems } from "../../src/lib/search"
import { ItemsFileSchema } from "../../src/lib/schemas"
import { ADAPTERS } from "../adapters"
import { COMMON_ALIASES_PATH, municipalityFile, ROOT } from "../core/paths"

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

function gitShow(ref: string, path: string): string | null {
  try {
    return execFileSync("git", ["show", `${ref}:${relative(ROOT, path)}`], {
      cwd: ROOT,
      encoding: "utf-8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    })
  } catch {
    return null
  }
}

const COMMON_WORDS =
  "ふとん,布団,蛍光灯,乾電池,ペンキ,タンス,ソファー,ベッド,冷蔵庫,洗濯機,テレビ,パソコン,スマホ,ガラケー,充電池,除湿機,バイク,注射針,ストーブ,石油ストーブ,PC,ブラウン管テレビ,液晶テレビ,ペットボトル,自転車,食器,カーテン,ギター,電球,傘,毛布,エアコン,掃除機,炊飯器,電子レンジ,ライター,スプレー缶,モバイルバッテリー,ゲーム機,CD,DVD,ピアノ,タイヤ,雑がみ,ダンボール,段ボール,釣り竿,スーツケース,ゴルフバッグ,iPad,タブレット,キーボード,ヒーター,ふすま,畳,たたみ,こたつ,マットレス,枕,ぬいぐるみ,おもちゃ,本,雑誌,新聞,衣類,靴,かばん,時計"

function main() {
  const base = argValue("--base") ?? "origin/main"
  const out = argValue("--out")
  const common = JSON.parse(
    readFileSync(COMMON_ALIASES_PATH, "utf-8")
  ) as Record<string, string[]>
  const words = argValue("--words")?.split(",") ?? [
    ...new Set([...COMMON_WORDS.split(","), ...Object.values(common).flat()]),
  ]
  const lines: string[] = []
  let pairs = 0
  let nonEmptyBefore = 0
  let top1Changed = 0
  let empty = 0
  let lost = 0
  let selfBefore = 0
  let selfAfter = 0
  let selfN = 0

  for (const slug of Object.keys(ADAPTERS)) {
    const path = municipalityFile(slug, "items.json")
    const baseText = gitShow(base, path)
    if (!existsSync(path) || baseText === null) continue
    const oldIdx = toSearchIndex(
      ItemsFileSchema.parse(JSON.parse(baseText)).items
    )
    const newIdx = toSearchIndex(
      ItemsFileSchema.parse(JSON.parse(readFileSync(path, "utf-8"))).items
    )
    const so = createSearcher(oldIdx)
    const sn = createSearcher(newIdx)
    for (const w of words) {
      pairs++
      const a = searchItems(so, w).slice(0, 3)
      const b = searchItems(sn, w).slice(0, 3)
      if (a.length > 0) nonEmptyBefore++
      const names = (l: typeof a) => l.map((i) => i.n).join(" / ")
      if (a.length > 0 && b.length === 0) {
        empty++
        lines.push(`EMPTY\t${slug}\t${w}\t以前: ${names(a)}`)
      } else if (a.length > 0 && a[0].id !== b[0]?.id) {
        top1Changed++
        lines.push(`TOP1\t${slug}\t${w}\t以前: ${names(a)}\t今: ${names(b)}`)
      } else if (a.length > 0 && a.some((x) => !b.some((y) => y.id === x.id))) {
        lost++
        lines.push(
          `LOST\t${slug}\t${w}\t消えた: ${names(a.filter((x) => !b.some((y) => y.id === x.id)))}\t残る: ${names(b)}`
        )
      } else if (a.length === 0 && b.length > 0) {
        lines.push(`NEW\t${slug}\t${w}\t今: ${names(b)}`)
      }
    }
    // 品目名で引いたとき、その品目が上位3件に出るか(名前・読みの検索は変わらないはず)
    for (const it of newIdx) {
      selfN++
      if (
        searchItems(so, it.n)
          .slice(0, 3)
          .some((x) => x.id === it.id)
      )
        selfBefore++
      if (
        searchItems(sn, it.n)
          .slice(0, 3)
          .some((x) => x.id === it.id)
      )
        selfAfter++
    }
  }
  const head = [
    `代表の語 ${words.length} 語 × 全市 = ${pairs} 組(以前に何か出ていた組 ${nonEmptyBefore})`,
    `先頭が変わった ${top1Changed} / 0件になった ${empty} / 以前の上位3件のどれかが消えた ${lost}`,
    `品目名で引いて上位3件に自分が出る: ${selfBefore}/${selfN} → ${selfAfter}/${selfN}`,
    "",
  ]
  const text = [...head, ...lines].join("\n") + "\n"
  if (out) writeFileSync(out, text)
  else process.stdout.write(text)
}

main()
