#!/bin/sh
# PR を出す前の二重チェック(docs/tech-stack.md §18)。
# 作業中のブランチの差分を、Codex CLI(別のモデル)に読み取り専用でレビューさせる。
#
# 使い方: npm run codex-review -- [比較元(既定 origin/main)] ["今回とくに見てほしい点"]
#   例: npm run codex-review
#       npm run codex-review -- origin/main "長浜市の categoryNotes を直した変更です"
#
# - Codex はファイルを書き換えない(-s read-only)。5〜10分かかる
# - 動いている間は、この作業フォルダのブランチを切り替えない(同じフォルダを読んでいる)
# - 結果(最後の回答)を標準出力に出す。途中経過のログは <結果のファイル>.log に残す
# - 指摘はそのまま信じず、市のページと元データで確かめてから直す
set -eu

BASE="${1:-origin/main}"
FOCUS="${2:-}"

if ! command -v codex >/dev/null 2>&1; then
  echo "codex コマンドが見つかりません(Codex CLI が入っていない)。二重チェックは省いて、その旨を報告に書く" >&2
  exit 127
fi

cd "$(git rev-parse --show-toplevel)"
OUT="$(mktemp "${TMPDIR:-/tmp}/mottainavi-codex-review.XXXXXX")"

PROMPT="あなたはコードとデータのレビュー担当です。ファイルは書き換えないでください(読み取りだけ)。
対象は、いまのブランチの ${BASE} からの差分です(git diff ${BASE}...HEAD --stat で変更ファイルが分かります)。
ごみ分別検索サイト「もったいナビ」の変更です。最大のリスクは誤案内(とくに電池・スプレー缶など火災につながる品目の案内の間違い)と、自治体の注意書きの欠落です。
差分に関係するものについて、次を見てください。
1) アダプタ(scripts/adapters/<自治体>/)の変換と設定に不具合がないか。
2) 元データ(data/cache/ のファイル)の区分と注意書きが、生成データ(data/municipalities/<自治体>/items.json)に欠落なく入っているか。スクリプトで全件突き合わせてよい。
3) 区分の説明(categoryNotes。区分の全品目に付く)と品目ごとの注記(itemNotes)が、品目ごとの自治体の注意書きと矛盾していないか、足りない安全上の条件がないか。その区分の全品目で確かめる。
4) data/municipalities/<自治体>/categories.json の kind の割り当てに不適切なものがないか(事前申込制でない粗大ごみを bulky にしていないか、市が収集しない区分が not-collected になっているか)。
5) 手放し導線(reuse-overrides.json、data/reuse-options.json)の追加・変更に問題がないか。
6) 品目データが変わるのに、municipality.json の data_version が上がっていない、ということがないか。
${FOCUS:+今回とくに見てほしい点: ${FOCUS}
}指摘は重要度の高い順に、日本語で、ファイル名と行を添えて、根拠と一緒に書いてください。問題がなければ、ないと書いてください。
最後に「確認したこと」と「確認できなかったこと」を箇条書きで添えてください。"

echo "Codex のレビューを始めます(比較元: ${BASE})。結果: ${OUT} / ログ: ${OUT}.log" >&2
codex exec -s read-only -c 'notify=[]' -c 'model_reasoning_effort="medium"' \
  -o "$OUT" "$PROMPT" >"${OUT}.log" 2>&1
cat "$OUT"
