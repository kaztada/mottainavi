import { readFileSync, writeFileSync } from "node:fs"
import { z } from "zod"
import { municipalityFile } from "./paths"

/**
 * データの取得元の状態(data/municipalities/<slug>/source.json)。
 * 市は更新のたびに新しい URL でファイルを出すことが多いので、URL はコードではなくここに置き、
 * データ更新の見張り(scripts/update-data.ts)が書き換えられるようにする(tech-stack.md §17)。
 */
export const SourceStateSchema = z.object({
  /** データファイル(または品目表のページ)の URL。アダプタの fetchSource はここから取得する */
  file_url: z.string().url(),
  /** 最後に確認したときの目印(リンク先・更新日など)。空文字は「まだ記録していない」 */
  fingerprint: z.string(),
})
export type SourceState = z.infer<typeof SourceStateSchema>

export function readSource(slug: string): SourceState {
  return SourceStateSchema.parse(
    JSON.parse(readFileSync(municipalityFile(slug, "source.json"), "utf-8"))
  )
}

export function writeSource(slug: string, state: SourceState): void {
  writeFileSync(
    municipalityFile(slug, "source.json"),
    JSON.stringify(SourceStateSchema.parse(state), null, 2) + "\n",
    "utf-8"
  )
}
