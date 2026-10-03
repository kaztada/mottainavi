---
name: update-municipality-data
description: もったいナビの対応済み自治体のデータ更新に対応する手順。Kaz が「データ更新を進めて」「データ更新を確認して」「自動の PR を確認して」「見張りの Issue が来た」「〇〇市のデータが更新されたらしい」と言ったとき、GitHub に「データ更新: 対応が必要です」の Issue や auto/data-update- で始まるブランチの PR があるときに必ず使う。新しい自治体の追加には add-municipality を使う。
---

# 対応済み自治体のデータ更新

市がデータを更新したときに、もったいナビのデータを作り直して本番に出すまでの手順。優先順位は **誤案内ゼロ > 月額0円 > 1人で維持できること**。Kaz はエンジニアではないので、報告は専門用語を避けて平易な日本語で書く。Kaz が決めるのは本番へのマージだけ。

## 仕組み(前提)

- 毎週月曜 6:00(日本時間)に GitHub Actions の「データ更新の見張り」(`.github/workflows/update-data.yml`)が `npm run update-data -- --all --apply` を実行する
- 各市の掲載ページ(または BODIK の API)を1回見て、目印(`data/municipalities/<slug>/source.json` の `fingerprint`)が前回と違えば更新とみなす。見張り方は各アダプタの `watch`
- うまく作り直せたら **PR**(ブランチ `auto/data-update-<日付>-<番号>`)、自動で直せなければ **Issue**(「データ更新: 対応が必要です」)
- 60日間リポジトリに動きが無いと、GitHub は定期実行を止める(止める前にメールが来る)。`gh workflow list` で「データ更新の見張り」が active か確かめ、止まっていたら `gh workflow enable update-data.yml` を Kaz に実行してもらう

## まず状況をつかむ

```
gh pr list --state open --json number,title,headRefName
gh issue list --state open --search 'in:title "データ更新"'
gh run list --workflow update-data.yml --limit 5
```

手元で確認だけするなら `npm run update-data -- --all`(何も書き換えない。各市に1回ずつアクセスするので、続けて何度も実行しない)。

## A. 自動で作られた PR を確認する

1. PR の本文の「変わる品目」を読む。**「⚠ 電池・スプレー缶など…」の欄があれば、1品目ずつ市の現行のページで確かめる**(充電式電池・モバイルバッテリー・ボタン電池・スプレー缶・カセットボンベ・ライター・蛍光灯・水銀製品・パソコン・消火器)
2. 区分が変わった品目・削除された品目が多いときは、市の告知(ごみの出し方の変更のお知らせ)を探して、変更に理由があるか確かめる。ごみサクがある市は `npm run compare-gomisaku` も使う
3. その市の `itemNotes`(食い違いの注記)が、新しいデータでもまだ必要か見る。市がデータを直していたら注記を外す
4. 新しく増えた品目に、手放し導線の誤判定が無いか見る(必要なら `reuse-overrides.json`)。増えた品目・名前が変わった品目は英訳が無い(「変わる品目」に「英語名: … → なし」と出る)ので、add-item-translations スキルの手順で足す。名前が変わって当たらなくなった自治体の辞書のキーは、`npm run items-en -- check` が知らせる
5. CI を走らせる。ボットが作った PR の CI は、GitHub の仕様で「承認待ち」で止まっている(`gh pr checks` には Vercel しか出ない)。承認待ちの実行を探して承認する:
   ```
   gh run list --workflow ci.yml --branch <ブランチ> --json databaseId,status,conclusion
   gh api -X POST repos/kaztada/mottainavi/actions/runs/<conclusion が action_required の databaseId>/approve
   ```
   そのあと `gh pr checks <番号>` で Vercel と `check` の両方が pass になるのを待つ。PR に「データの検査」のコメントも付く(Kaz が GitHub の画面で「Approve and run」を押しても同じ)
6. 品目・区分・注意文言が変わる更新は、**Codex の二重チェック**をする(tech-stack.md §18): PR のブランチを手元に取り出して `npm run codex-review` を実行し、指摘を市のページと元データで確かめる。結果は PR のコメントに残す。確認記録だけの PR(`source.json` だけ)では不要
7. 直すところがあれば、そのブランチに追加でコミットする。問題なければ、変わる内容を平易にまとめて Kaz に伝え、マージボタンを付ける:

```bash
gh pr merge <番号> --merge --delete-branch
```

8. マージ後: main の CI と Vercel、本番でその市の検索データ(`/data/<slug>/search.json?v=<新しい版番号>`)と品目のページを確認。`docs/roadmap.md` の表の「データ更新」と、記憶ファイルに記録する

確認記録だけの PR(タイトルが「chore: データの取得元の確認記録を更新(自動)」)は、`source.json` しか変わらない。差分がそれだけであることを見て、そのままマージボタンを渡す。

## B. Issue が来た(自動では作り直せなかった)

Issue の理由ごとに対応する。作業はブランチ `data/<slug>-<日付>` で行い、最後は PR にする。

- **新しい区分名・注意文言の欠落(作り直しが完了条件を満たさない)**: 手元で `source.json` の `file_url` を Issue にある新しい取得元にして、`npm run build-data -- --municipality <slug> --refresh` を実行し、ログの「未解決の区分ラベル」を見る。市のページで新しい区分の意味を確かめ、アダプタの対応表と `categories.json` を直す(kind の決め方は add-municipality の表)。直ったら `fingerprint` を今の値にする(`npm run update-data -- --municipality <slug>` の「今回」の値)
- **品目数が大きく変わった**: データの形式が変わったか、市が大きく改訂したか。ファイルを開いて確かめる。改訂なら、危険物と無作為の20品目以上を市の現行の案内と突き合わせてから進める。`expectedMinItems` も見直す
- **itemNotes の品目が CSV に無い**: 市が品目名を変えたか、食い違いを直した可能性。新しいデータでその品目を探し、注記を付け替えるか外す
- **河内長野市(PDF)**: `source.json` の `file_url` を新しい PDF にする → `npm run build-data -- --municipality kawachinagano-city --refresh`(PDF を取得してエラーで止まるのが正常)→ `python3 scripts/adapters/kawachinagano-city/extract_text.py`(pypdf が無ければ `uv run --with pypdf python …`)→ もう一度 build-data → **切り出した品目を PDF のページ画像と30品目以上照合する**(行の崩れは見た目では分からない)
- **確認できませんでした(掲載ページのリンクが見つからない・複数ある・取得失敗)**: 市がページの構成を変えた可能性。掲載ページを開いて、アダプタの `watch`(`linkText` や `pageUrl`)を直す。GitHub のサーバーからだけ届かない場合は、その旨を Kaz に伝える
- **PR を作れませんでした**: ブランチは push 済み。`gh pr create --head <ブランチ>` で PR を作る。Kaz に、GitHub Actions の PR 作成の許可がオフになっていないか確かめてもらう

どの場合も、`data_version` を必ず上げ(`npm run check-data` が検査する)、`data_fetched_at` を取得日にする。コミットしてから `npm run build-data -- --all` → `npm run check-data` → テスト・lint・ビルド。PR を作る前に Codex の二重チェック(`npm run codex-review`、tech-stack.md §18)をして、指摘を確かめて直す。PR を作り、Vercel と CI が緑になってからマージボタンを渡す。Issue は PR の本文に `Closes #<番号>` と書いて閉じる。

## 守ること

- 市のデータを手で書き換えない。食い違いは `itemNotes` で注記する
- 市のサイトへのアクセスは必要な回数だけ(確認1回、取得1回)。同じ URL を続けて取得しない
- 自分ではマージしない。危険物の区分が変わる更新は、確認した内容(どのページで何を確かめたか)を Kaz に必ず伝える
