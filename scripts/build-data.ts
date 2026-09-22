/**
 * データパイプラインのCLI。自治体ごとのアダプタで原本を読み、
 * data/municipalities/<slug>/items.json と id-map.json を生成する。
 *
 * 実行: npm run build-data -- --municipality osaka-city [--refresh]
 *   --municipality: 対象自治体のslug(scripts/adapters/index.ts に登録済みのもの)
 *   --refresh: キャッシュを無視して原本を再取得(通常は不要。連続実行しないこと)
 */
import { ADAPTERS } from "./adapters"
import { runPipeline } from "./core/pipeline"

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

async function main() {
  const refresh = process.argv.includes("--refresh")
  const slug = argValue("--municipality")
  if (!slug) {
    console.error(
      `--municipality <slug> を指定してください。登録済み: ${Object.keys(ADAPTERS).join(", ")}`
    )
    process.exit(1)
  }
  const adapter = ADAPTERS[slug]
  if (!adapter) {
    console.error(`アダプタ未登録の自治体です: ${slug}(scripts/adapters/index.ts に追加してください)`)
    process.exit(1)
  }
  const result = await runPipeline(adapter, { refresh })
  if (!result.ok) process.exitCode = 2
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
