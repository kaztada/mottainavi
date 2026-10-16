/**
 * 外のサイトの URL を1件、行儀よく取得する CLI(決まりは scripts/core/polite-fetch.ts)。
 * エージェントが照合のために自治体のサイトや公開データの資料を読むときは、curl や WebFetch で直接取らず、これを使う。
 *
 * 実行: npx tsx scripts/tools/fetch.ts <URL> [--refresh] [--retry-failed] [--text]
 *   --refresh       記録があっても取り直す(その1件だけ)
 *   --retry-failed  前に失敗した URL(接続できなかった・応答が 2xx でなかった)を取り直す
 *   --text          本文を文字に直して表示する(UTF-8 / Shift_JIS / EUC-JP。先頭 200,000 文字まで)
 *
 * - 同じ URL は二度取りに行かない。2回目からは保存した本文を返す。取り直しは --refresh で1件ずつ
 * - 失敗した URL も、記録があれば取りに行かない(取り直すときだけ --retry-failed)
 * - 同じホストへは同時に1件まで、1件ごとに 2.5 秒以上あける。ほかのエージェントが同時に動かしていても守る
 *   (順番待ちのあいだは止まって見える)
 * - 表示: 記録(JSON。from_cache=取りに行かなかった、body_path=本文のファイルの絶対パス)。
 *   取得に失敗したとき(応答が 2xx でないときも)は終了コード 1
 * - 記録は data/cache/catalog/fetch-log.jsonl(コミットする)、本文は work/fetch/(コミットしない)
 */
import { join } from "node:path"
import { decodeText, isFetchOk, politeFetch } from "../core/polite-fetch"
import { ROOT } from "../core/paths"

const TEXT_LIMIT = 200_000
const USAGE =
  "使い方: npx tsx scripts/tools/fetch.ts <URL> [--refresh] [--retry-failed] [--text]"

async function main() {
  const args = process.argv.slice(2)
  const flags = new Set(args.filter((a) => a.startsWith("--")))
  const urls = args.filter((a) => !a.startsWith("--"))
  const unknown = [...flags].filter(
    (f) => !["--refresh", "--retry-failed", "--text"].includes(f)
  )
  if (urls.length !== 1 || unknown.length > 0) {
    if (unknown.length > 0)
      console.error(`知らないオプション: ${unknown.join(" ")}`)
    if (urls.length > 1) console.error("URL は1回に1件だけ")
    console.error(USAGE)
    process.exitCode = 1
    return
  }

  const { record, body, fromCache } = await politeFetch(urls[0], {
    refresh: flags.has("--refresh"),
    retryFailed: flags.has("--retry-failed"),
  })
  const bodyPath = record.file && body ? join(ROOT, record.file) : null
  console.log(
    JSON.stringify(
      { from_cache: fromCache, body_path: bodyPath, record },
      null,
      2
    )
  )

  if (flags.has("--text") && body) {
    const text = decodeText(body, record.content_type)
    console.log("\n--- 本文(文字に直したもの) ---")
    console.log(text.slice(0, TEXT_LIMIT))
    if (text.length > TEXT_LIMIT)
      console.log(
        `\n--- 先頭 ${TEXT_LIMIT} 文字まで(全体は ${text.length} 文字) ---`
      )
  }
  if (!isFetchOk(record)) {
    console.error(
      record.error
        ? `取得に失敗しました: ${record.error}`
        : `取得に失敗しました: 応答 ${record.status}`
    )
    if (fromCache)
      console.error(
        `(${record.fetched_at} の記録。取り直すときは --retry-failed)`
      )
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
