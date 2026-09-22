/**
 * データパイプラインのCLI。自治体ごとのアダプタで原本を読み、
 * data/municipalities/<slug>/items.json と id-map.json を生成する。
 *
 * 実行: npm run build-data -- --municipality osaka-city [--refresh]
 *       npm run build-data -- --all [--refresh]
 *   --municipality: 対象自治体のslug(scripts/adapters/index.ts に登録済みのもの)
 *   --all: 登録済みの全自治体を順に処理する(1つ失敗しても残りは続け、最後に異常終了コード)
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
  const all = process.argv.includes("--all")
  const slug = argValue("--municipality")

  const targets = all ? Object.values(ADAPTERS) : slug ? [ADAPTERS[slug]] : []
  if (targets.length === 0 || targets.some((a) => !a)) {
    console.error(
      slug
        ? `アダプタ未登録の自治体です: ${slug}(scripts/adapters/index.ts に追加してください)`
        : `--municipality <slug> または --all を指定してください。登録済み: ${Object.keys(ADAPTERS).join(", ")}`
    )
    process.exit(1)
  }

  const failed: string[] = []
  for (const adapter of targets) {
    try {
      const result = await runPipeline(adapter, { refresh })
      if (!result.ok) failed.push(adapter.slug)
    } catch (err) {
      console.error(`✗ ${adapter.slug}:`, err)
      failed.push(adapter.slug)
    }
  }
  if (failed.length > 0) {
    console.error(`\n✗ 完了条件を満たさない自治体: ${failed.join(", ")}`)
    process.exitCode = 2
  } else if (targets.length > 1) {
    console.log(`\n✓ ${targets.length} 自治体すべて完了`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
