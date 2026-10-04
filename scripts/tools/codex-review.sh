#!/bin/sh
# PR を出す前の二重チェック(docs/tech-stack.md §18)。
# 作業中のブランチの差分を、Codex CLI(別のモデル)に読み取り専用でレビューさせる。
#
# 使い方: npm run codex-review -- [--items-en] [比較元(既定 origin/main)] ["今回とくに見てほしい点"]
#   例: npm run codex-review
#       npm run codex-review -- origin/main "長浜市の categoryNotes を直した変更です"
#       npm run codex-review -- --items-en        (品目名の英訳の PR。見る点を英訳用に切り替える)
#
# - 対象はコミット済みの差分。コミットしていない変更があると止まる(指摘を直したら、コミットしてからもう一度実行する)
# - Codex はファイルを書き換えない(-s read-only)。5〜10分かかる
# - 動いている間は、この作業フォルダのブランチを切り替えない(同じフォルダを読んでいる)
# - 標準入力は閉じて実行する(開いたままだと、バックグラウンドで動かしたときに Codex が入力待ちで止まる)
# - 結果(最後の回答)を標準出力に出す。途中経過のログは <結果のファイル>.log に残す
# - 指摘はそのまま信じず、市のページと元データで確かめてから直す
set -eu

KIND="data"
if [ "${1:-}" = "--items-en" ]; then
  KIND="items-en"
  shift
fi
BASE="${1:-origin/main}"
FOCUS="${2:-}"

if ! command -v codex >/dev/null 2>&1; then
  echo "codex コマンドが見つかりません(Codex CLI が入っていない)。二重チェックは省いて、その旨を報告に書く" >&2
  exit 127
fi

cd "$(git rev-parse --show-toplevel)"

# レビューの対象はコミット済みの差分(BASE...HEAD)。コミットしていない変更があると、
# Codex が読むファイルとレビュー対象が食い違うので、先にコミットしてもらう
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "コミットしていない変更があります。コミットしてから実行してください(直したあとの再レビューも同じ)" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi
OUT="$(mktemp "${TMPDIR:-/tmp}/mottainavi-codex-review.XXXXXX")"

if [ "$KIND" = "items-en" ]; then
PROMPT="あなたは翻訳とデータのレビュー担当です。ファイルは書き換えないでください(読み取りだけ)。
対象は、いまのブランチの ${BASE} からの差分です(git diff ${BASE}...HEAD --stat で変更ファイルが分かります)。
ごみ分別検索サイト「もったいナビ」で、品目名(日本語)に英訳(name_en)を足した変更です。英訳は data/i18n/items.en.json(共通辞書。同じ品目名のある他市にも付く)と data/municipalities/<自治体>/items.en.json(その市だけの辞書)にあり、生成データ data/municipalities/<自治体>/items.json の name_en に入ります。
最大のリスクは誤案内です。英語の利用者が英訳を見て別の品目と取り違え、収集しない物(電池・家電・フロンを含む機器・パソコンなど)を出してしまうこと。
訳の決まりは docs/data-model.md の 25 章にあります(品目名だけを訳す/括弧内の条件は落とさない/文頭だけ大文字・補足は括弧・ASCII/日本特有のものはローマ字と説明/米語が基本/意味が割れるものは区分と注意点から括弧で補う)。
次を見てください。
A) 今回 name_en が付いた全品目(訳した市と、共通辞書を通じて同じ品目名に付いた他市の分)を、品目名・区分・注意点と突き合わせ、誤訳、条件の欠落や付け足し、取り違えそうな訳を挙げる。スクリプトで一覧を作って全件読んでよい。
B) 同じ市の中で、区分が違う別の品目(すでに英訳のある品目を含む)に、同じか区別のつかない英訳が付いていないか。とくに片方が収集しない区分のとき。
C) 共通辞書の訳が他市の同名の品目に付いたとき、その市の区分・注意点や、似た名前の別の品目から見て、別の物を指したり対象を狭めたりしていないか。
D) 今回の差分で、name_en と generated_at 以外(品目名・区分・注意文言)が変わっていないか。品目データが変わった市の municipality.json の data_version が上がっているか。
E) 英語として不自然な訳、英語話者が検索しそうな語が入っていない訳。
好みの違い(同じくらい良い言い換え)は挙げないでください。
${FOCUS:+今回とくに見てほしい点: ${FOCUS}
}指摘は重要度の高い順に、日本語で、品目の ID・品目名・今の訳・提案する訳・根拠を書いてください。問題がなければ、ないと書いてください。
最後に「確認したこと」と「確認できなかったこと」を箇条書きで添えてください。"
else
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
fi

echo "Codex のレビューを始めます(比較元: ${BASE})。結果: ${OUT} / ログ: ${OUT}.log" >&2
# モデルとエフォートは Kaz の指定(2026-10-04): GPT-6.1-Sol・high。同じコミットで GPT-6-Astra・medium と比べ、
# 指摘は同じ2件+新しい2件、トークンは約1.5倍だった。変えたいときは環境変数で上書きする
MODEL="${CODEX_REVIEW_MODEL:-gpt-6.1-sol}"
EFFORT="${CODEX_REVIEW_EFFORT:-high}"
echo "モデル: ${MODEL} / エフォート: ${EFFORT}" >&2
codex exec -m "$MODEL" -s read-only -c 'notify=[]' -c "model_reasoning_effort=\"${EFFORT}\"" \
  -o "$OUT" "$PROMPT" </dev/null >"${OUT}.log" 2>&1
cat "$OUT"
