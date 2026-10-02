# tech-stack.md — 技術スタック設計書

バージョン: v0.1 (2026-07-04)

---

## 1. 選定サマリ

| レイヤ | 採用 | 理由 |
|---|---|---|
| フレームワーク | **Next.js 15 (App Router) + TypeScript** | SSGで高速・無料運用。ディープリンク(/item/[id])が容易。Claude Codeの学習データ豊富で実装が速い |
| スタイリング | **Tailwind CSS v4** | プロトタイピング速度。#ちるエコ日和トーンをデザイントークンで管理 |
| 検索 | **Fuse.js(クライアントサイド)** | 1,000品目規模ならブラウザ内あいまい検索で十分。サーバ不要=コスト0 |
| i18n | **軽量自作(JSONベース)** | 2言語・静的サイトなら next-intl は過剰。Context+JSON辞書で足りる |
| かな変換(ビルド時) | **kuromoji(または wanakana 併用)** | name_kana 生成用。実行はビルド時のみでバンドルに含めない |
| ホスティング | **Vercel(Hobby)** | 無料・自動デプロイ・Analytics標準 |
| データパイプライン | **TypeScript(tsx実行)+ cheerio** | HTMLパース。プロジェクト内 scripts/ に同居 |
| 計測 | Vercel Analytics | クッキーレス |

## 2. 判断メモ(なぜ他を選ばなかったか)

- **Astro でなく Next.js**: Astroも静的サイトに好適だが、検索UIのインタラクティブ性が主役のアプリなので、Reactフルの Next.js の方が Claude Code との相性含め総合的に速い
- **サーバ検索(Algolia等)を使わない**: 1,000件×短文フィールドならJSON全載せ(gzip後 数百KB以下)で問題ない。無料枠管理も不要に
- **DB(Supabase等)を使わない**: 更新頻度が低い読み取り専用データ。JSONで十分
- **next-intl を使わない**: ルーティング分離(/en)は欲しいが、静的2言語ならレイアウトレベルの自作Providerで実現可能。依存を減らす

## 3. プロジェクト構造

```
mottainavi/
├── CLAUDE.md
├── docs/                      # 設計書一式(このセット)
├── data/                      # data-model.md 参照
├── scripts/
│   └── build-data.ts          # パイプライン(fetch→parse→enrich→validate→emit)
├── src/
│   ├── app/
│   │   ├── layout.tsx         # 共通レイアウト+LanguageProvider
│   │   ├── page.tsx           # S1/S2(検索)
│   │   ├── item/[id]/page.tsx # S3(詳細)generateStaticParamsで全品目SSG
│   │   └── about/page.tsx     # S4
│   ├── components/
│   │   ├── SearchBox.tsx
│   │   ├── ItemCard.tsx
│   │   ├── CategoryBadge.tsx
│   │   ├── DispositionCard.tsx
│   │   ├── ReuseOptionCard.tsx
│   │   └── LangToggle.tsx
│   ├── lib/
│   │   ├── search.ts          # Fuse.js初期化・正規化
│   │   ├── i18n.tsx           # 辞書ロード+useT()フック
│   │   └── data.ts            # JSON読み込みユーティリティ
│   └── styles/globals.css
├── public/ogp.png
└── package.json
```

## 4. 検索設計の要点(lib/search.ts)

- 正規化: NFKC → 小文字化 → カタカナ→ひらがな変換 → 長音・スペース除去。クエリと対象の両方に適用
- Fuse.js 設定の初期値:
  ```ts
  new Fuse(items, {
    keys: [
      { name: "name_ja", weight: 0.5 },
      { name: "name_kana", weight: 0.3 },
      { name: "aliases", weight: 0.15 },
      { name: "name_en", weight: 0.05 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 1,
  })
  ```
- **英数字だけの検索語は、英語を語単位で照合する**(2026-10-03。英訳を全市へ広げる前の準備)。日本語の検索語は上の Fuse 設定のまま変えない
  - 理由: 英語名も空白を除いてあいまい検索していたため、語をまたいで当たっていた(`gas` が「containin**g as**bestos」に一致、`battery` で `Pottery`)
  - 対象: 英語名(`name_en`)と、英数字だけの別名(`PET`、`sofa`、`fridge` など)。小文字化し、英数字以外で語に分け、複数形をそろえる(`englishWords`)
  - 一致の強さ: 語がそのまま一致 → 語の先頭が一致(続けて書いた `sofabed` も) → 語の途中に含む(検索語が4文字以上) → 1文字の打ち間違い(6文字以上)。検索語が複数の語なら、すべての語が当たる品目だけ
  - 並び順: そのまま一致・先頭一致の品目 → 日本語名へのあいまい検索(`CDプレーヤー`、`LED電球` など。キーは name_ja・name_kana・日本語の別名)→ 途中の一致・打ち間違いの品目。同じ強さの中では、当たった語が前にあるもの、短い名前(英語名は括弧の前の語数)、英語名に当たったものを上に
- Fuseインデックスは初回検索時に遅延構築。items JSONは動的import(初期表示を軽く)
- 「区分から見る」はFuseを使わず category_id フィルタ

## 5. パフォーマンス予算

- 初期ロード(S1): JS 200KB gzip 以下 / LCP 2.0s(4G)以下
- items JSON: 遅延ロード。300KB gzip を超える場合は search用フィールドのみの軽量インデックスJSONと詳細JSONに分割
- 詳細ページ(S3)はSSGなので即時表示

## 6. 品質・運用

- Lint/Format: ESLint + Prettier(Next.js標準構成)
- 型: strict: true。データJSONは zod でスキーマ検証(パイプラインとアプリ双方で共用)
- テスト(最小限): 検索正規化関数とパイプラインのパース関数のみ Vitest でユニットテスト。UIテストはスコープ外
- デプロイ: GitHub main ブランチ → Vercel 自動デプロイ
- データ更新運用: `npm run build-data` を手動実行 → 差分をコミット → 自動デプロイ

## 7. 将来拡張の足場(実装はしないが壊さない)

- 自治体追加: data/items/[municipality-id].json を増やし、トップに自治体選択を追加するだけで済む構造を維持
- 言語追加: ui.[lang].json と items.[lang].json の追加で対応可能に
- 写真判定: S3のUIに「写真で調べる(準備中)」の場所だけ想定しておく(実装しない)

---

# 全国展開対応(v0.2 / 2026-09-22 承認)

§3・§5・§7 の記述と矛盾する箇所は、この §8 以降が優先する。

## 8. URL設計

| パス | 内容 | 生成方法 |
|---|---|---|
| `/` | 自治体選択(S0) | SSG 1枚 |
| `/[municipality]` | 検索ホーム(S1/S2) | SSG(対応自治体+未対応自治体の全件) |
| `/[municipality]/item/[id]` | 品目詳細(S3) | rewrite → 自治体ごとのシェル1枚 |
| `/[municipality]/about` | このサイトについて(S4) | SSG |
| `/item/[id]`(旧) | — | 308 で `/osaka-city/item/[id]` へ転送 |

URL が自治体を自己記述するため、共有リンクが受け手の localStorage 設定に左右されない。
旧URLは `next.config.ts` の `redirects()` で恒久転送し、公開済みリンクと被リンクを引き継ぐ。

自治体スラッグはレジストリの `slug`。同名自治体は都道府県を前置して衝突回避する(data-model.md §8)。

## 9. 詳細ページのレンダリング方式

**採用: クライアント描画(静的シェル + rewrite)**。`generateStaticParams` による全品目SSGは廃止する。

比較:

| 案 | 0円維持 | 品目別OGP | Lighthouse | 1,741自治体×1,000品目 |
|---|---|---|---|---|
| A. 全品目SSG(v0.1) | ○ | ◎ | ◎ | ✗ 約182万ページでビルド不能 |
| B. ISR/オンデマンド生成 | △ 無料枠と Hobby 規約に依存 | ◎ | ○ | △ 関数バンドル上限 |
| C. クライアント描画(採用) | ◎ 純静的 | ✗ | ○ | ◎ 上限なし |
| D. 代表品目のみSSG + C | ◎ | △ 一部 | ○ | ◎ |

**Bを採らない理由**: 「サーバ・DBを使わない」という本プロジェクトの前提を破り、
0円運用が無料枠の上限と Hobby の非商用条項に依存する形になる。これは後戻りしにくい依存。

**Cの仕組み**:
1. `next.config.ts` の `rewrites()` で `/:municipality/item/:id` → `/:municipality/item`
2. `/[municipality]/item` を自治体ごとにSSG(シェル1枚)
3. シェルが `window.location.pathname` から品目IDを読み(rewrite 後の SSG 時パスとの食い違いを避けるため `usePathname()` は使わない)、`public/data/<muni>/items/NN.json` を fetch
4. タイトルは `document.title` をクライアントで設定

**トレードオフ(承認済み)**:
- 品目別の OGP 画像とメタ説明は失われる。サイト共通OGPのみになる
- 品目ページは検索エンジンにインデックスされない。長尾SEOは取りに行かない
- 存在しないIDはソフト404(HTTP 200 + 「見つかりません」表示)になる
- 品目別SSG(案D。対応自治体 × よく調べられる品目50件程度)は Phase B 以降の上乗せ候補。
  SSG済みパスと rewrite の優先順位の検証が必要

## 10. データ配信と遅延ロード

バンドルへの静的 import(`import items from "../../data/items/osaka-city.json"`)を廃止し、
`public/data/` からの fetch に統一する。バンドラが自治体数に比例して肥大するのを避けるため。

- 検索: `/data/<muni>/search.json?v=<data_version>`(gzip 34KB)を初回インタラクション時に fetch
- 詳細: `/data/<muni>/items/NN.json?v=<data_version>`(gzip 約4KB)を該当シャード1本だけ fetch
- 自治体選択: `/data/municipalities.json?v=<内容ハッシュ>`(gzip 約29KB)を都道府県を選ぶときに fetch
- 配信データの形式とURLは `src/lib/public-data.ts` に集約(ビルドスクリプトとアプリで共用)
- ブラウザ側では zod を使わない(配信データはビルド時に検証済み。バンドル削減のため)
- `next.config.ts` の `headers()` で `/data/*` に `Cache-Control: public, max-age=31536000, immutable`
- 更新時は `data_version` が変わり、クエリ違いで新規取得される
- 配信元URLは定数1つに集約し、将来 Blob/R2 等の外部ストレージへ差し替えられるようにする

`public/data/` は `prebuild` スクリプトで `data/municipalities/**` から毎回導出する(git管理外)。

## 11. パイプラインのアダプタ構造

```
scripts/
├── build-data.ts          # CLI: --municipality <slug> [--refresh] / --all
├── build-registry.ts      # 全国地方公共団体コードから municipalities.json を生成
├── registry/slug.ts       # slug 生成規則(data-model.md §15)
├── build-public-data.ts   # prebuild: data/ → public/data/(シャード分割)
├── core/                  # 自治体を知らない共通処理
│   ├── pipeline.ts        # enrich → validate → emit → id-map 更新
│   ├── fetch-cache.ts     # 1回取得・キャッシュ優先・連続アクセス抑止を強制
│   ├── enrich.ts, ids.ts, validate.ts, types.ts
└── adapters/
    └── osaka-city/
        ├── index.ts       # Adapter 実装
        ├── parse.ts       # 現 scripts/lib/parse.ts を移動
        └── category-map.ts # 現 scripts/lib/category-map.ts を移動
```

Adapter の契約(`scripts/core/types.ts`):

```ts
interface MunicipalityAdapter {
  slug: string
  fetchSource(opts: { refresh: boolean }): Promise<{ source: string; fromCache: boolean; location: string }>
  parse(source: string): RawItem[]                 // 区分ラベルは自治体の表記のまま
  resolveCategoryId(label: string): string | null  // ラベル → この自治体の区分ID
  expectedMinItems: number                         // 下回ったらパーサ破損を疑う
}
```

区分の解決をアダプタに分けたのは、未解決ラベルの一覧を共通 core 側で集計して報告するため。
共通 core は自治体を知らず、`kind` と汎用スキーマだけで enrich / validate / emit を行う。
品目IDは id-map で固定し、品目数が前回から10%超変動したら警告する。
Phase A は大阪市アダプタへの切り出しと CLI 引数化まで。`--all` の実装は Phase B。

**データ取得方針の優先順位**:
1. オープンデータ(CSV/Excel)— ライセンスが明示され、構造が安定
2. 構造の安定したHTML表のスクレイピング
3. 手作業転記(小規模自治体の最終手段)

いずれも同じ Adapter 契約の実装違いとして扱い、`source_type` に由来を記録する。
実例: `scripts/adapters/osaka-city/`(HTML表のスクレイピング)と `scripts/adapters/yokohama-city/`(独自形式のオープンデータ CSV。CP932 の復号はアダプタ内に持つ)。RFC 4180 の CSV パーサは `scripts/core/csv.ts`。

**国の標準形式の CSV は共通アダプタで読む(2026-10-02)**: 自治体標準オープンデータセット「ごみの分別方法」(列名が「ごみの分別方法_品目」等)は `scripts/core/standard-csv.ts` の `createStandardCsvAdapter(config)` で読む。自治体ごとに書くのは設定(`scripts/adapters/<slug>/index.ts`)だけ: 更新の見張り方(取得元の URL は source.json。§17)、文字コード、列名の接頭辞、区分の表記 → 区分ID、区分ごとの公式リンク、収集しない区分、区分の説明、1セル2区分の区切り、半角カナの変換、注意文言に足す列(`extraNoteColumns`。「備考」「料金備考」に注意書きがある市)、品目ごとの注記(`itemNotes`。市の現行の案内と食い違う品目に、データは変えずに添える)。注意文言の組み立て順は固定(収集しません → 市の表記 → 区分の説明 → 市の注意点)。同じ品目名の行は1品目にまとめる(同じ区分は注意点のあるほうを残し、区分が違えば区分ごとのカード)。列名に接頭辞が無い市は `headerPrefix` を空文字にする。東大阪市・平塚市・鹿児島市・沖縄市・須賀川市がこの形で、設定と categories.json の整合は `scripts/adapters/standard-csv-configs.test.ts` が登録済みの全自治体をまとめて検査する。Excel・PDF・HTML は形式が市ごとに違うので個別アダプタのまま。
`npm run build-data -- --all` で登録済みの全自治体を順に生成する(1つ失敗しても残りは続け、最後に異常終了コード)。
市サイトへのアクセスは core 側で1回取得+キャッシュを強制し、連続アクセスしない。

## 12. パフォーマンス予算(更新)

| 画面 | 目標 | 備考 |
|---|---|---|
| `/`(自治体選択) | LCP 2.0s以下 | 全国リスト(gzip 約40KB)は選択UIを開いたときだけ fetch |
| `/[municipality]`(検索) | 現行維持(Perf 98) | 検索インデックスは初回インタラクション時ロード(現行どおり) |
| `/[municipality]/item/[id]` | Perf 90+ | シェルは静的。LCP はシャード fetch(gzip 約4KB)の完了で決まる |

詳細ページの Lighthouse モバイル 90+ 維持は Phase A の完了条件に含め、実測で確認する。

## 13. 将来のデータ量(Phase C 以降の未決事項)

1,741自治体 × 約1,000品目では `data/` が約1.4GB となり git リポジトリに収まらない。
Phase A では配信元URLを定数1つに集約するところまでとし、
外部ストレージへの移行判断は Phase C で行う。

## 14. Phase A 実装後のプロジェクト構造(2026-09-23)

§3 の構造図は v0.1 のもの。Phase A 後の主要部分は次のとおり。

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                      # S0 自治体選択(保存済みなら描画前に直行)
│   └── [municipality]/
│       ├── page.tsx                  # S1/S2 検索 or S0' 未対応(全1,741件SSG)
│       ├── item/page.tsx             # S3 シェル(対応自治体のみSSG。rewrite で /item/<id> を受ける)
│       └── about/page.tsx            # S4
├── components/
│   ├── SelectShell.tsx / UnsupportedShell.tsx / MunicipalitySwitch.tsx / RememberMunicipality.tsx
│   ├── ItemDetailLoader.tsx          # シャード fetch → ItemDetail
│   └── (既存: HomeShell, SearchSection, ItemCard, ItemDetail, CategoryBadge, …)
└── lib/
    ├── schemas.ts                    # zod スキーマ(サーバ・スクリプト用)
    ├── category-kind.ts              # kind と既定の色・アイコン(zod 非依存)
    ├── public-data.ts                # 配信データのURL・シャード計算・導出
    ├── municipality-storage.ts       # localStorage キーと自動転送スクリプト
    └── data.ts                       # SSG 時の自治体データ読み込み
scripts/
├── build-data.ts / build-registry.ts / build-public-data.ts
├── core/ (pipeline, enrich, ids, fetch-cache, paths, types)
├── adapters/ (index.ts, osaka-city/)
└── registry/slug.ts
```

コマンド:

| コマンド | 内容 |
|---|---|
| `npm run build-data -- --municipality osaka-city` | 自治体の品目データを生成(キャッシュ優先) |
| `npm run build-registry` | 全国レジストリを再生成(手で保守した値は引き継ぐ) |
| `npm run build` | prebuild で public/data を導出してからビルド |
| `npm run check-data` | データの検査(再現性・版番号・変わる品目)。先に `build-data -- --all` を実行しておく |
| `npm run update-data -- --all [--apply]` | 各市のデータ更新を確認する。`--apply` で更新があった市を作り直す(§17) |
| `npm run compare-gomisaku -- --code <4桁> --csv <path>` | 市公式の分別辞典(ごみサク)と照合して、データの鮮度を確かめる(§16) |

## 15. PR の自動検査(CI、2026-10-02)

開発のパイプライン化の第1段階(roadmap.md「開発の自動化」)。GitHub Actions(`.github/workflows/ci.yml`)が、PR と main への push のたびに次を実行する。公開リポジトリなので無料。

1. `npm run lint` / `npm test`
2. `MOTTAINAVI_OFFLINE=1 npm run build-data -- --all` — git にあるキャッシュだけで全自治体のデータを作り直す。**CI から自治体サイトへはアクセスしない**(キャッシュが無ければ取得せずエラー。`scripts/core/fetch-cache.ts`)
3. `npm run check-data`(`scripts/check-data.ts`、比較ロジックは `scripts/core/data-check.ts`)
   - **再現性**: コミットされた items.json / id-map.json が、パイプラインの出力と一致すること(generated_at は無視)。作り直し忘れ、手での書き換え、共通コードの変更による他市への波及を検出する
   - **版番号**: 比較元(PR のマージ先)から品目データの中身が変わった自治体は、`data_version` も変わっていること。`/data/*` は1年キャッシュなので、上げ忘れると一度見たブラウザに古いデータが残る(2026-09-25 に実際に起きた)
   - **変わる品目の一覧**: 自治体ごとの追加・削除・変更を PR にコメントする(合否には使わない。人が「良い変化か」を確認するため)
4. `npm run build`

ローカルでも同じ検査ができる: コミットしてから `npm run build-data -- --all` → `npm run check-data`(比較元は既定で origin/main。`--base <ref>` で変更可)。

本番への反映(マージ)は人が行う。マージボタンを渡す前に、Vercel と CI の両方が成功していることを確認する。

## 16. 自治体追加の手順(2026-10-02)

開発のパイプライン化の第2段階。自治体の追加は、手順書 `.claude/skills/add-municipality/SKILL.md` のとおりに進める(「〇〇市を追加して」で起動)。流れは 調査 → 鮮度の照合 → **Kaz が入れるか保留かを決める** → 実装 → 検証 → PR → **Kaz がマージ** → 本番確認 → 記録。これまでの教訓(申込制でない粗大ごみを bulky にしない、収集しない区分の注意文言、出典の書式など)も手順書にまとめてある。

鮮度の照合には `npm run compare-gomisaku -- --code <4桁> (--csv <path> | --municipality <slug>)` を使う(`scripts/tools/`)。市公式のネット版分別辞典「ごみサク」と品目名で突き合わせ、区分が食い違う候補と、危険物など個別に確認する品目を出す。ごみサクのデータは照合に使うだけでリポジトリには置かない(利用条件が不明のため、OS の一時フォルダに1回だけ取得)。ごみサクのほうが古いこともあるので、結果は判断材料として扱う。

## 17. データ更新の見張り(2026-10-02)

開発のパイプライン化の第3段階。市がデータを更新したら、機械が気づいて作り直し、PR まで出す。本番へのマージは人が行う。

- **取得元は設定ファイル**: データファイルの URL は `data/municipalities/<slug>/source.json`(`file_url` と、最後に確認したときの目印 `fingerprint`)。市の多くは更新のたびに新しい URL でファイルを出すので、コードに直書きせず、見張りが書き換えられるようにした
- **検出**(`scripts/core/watch.ts`、アダプタの `watch`): 週1回、対象を1回だけ取得して目印を前回と比べる
  - `ckan`(東大阪市・鹿児島市): BODIK の API で、いちばん新しい CSV の URL と更新日時
  - `page-link`(平塚市・横浜市・枚方市・河内長野市): 掲載ページの中の、データファイルへのリンク(リンクの文言で特定)。目印はリンク先・リンクの文言(ファイルサイズや更新月を含む)・直後の最終更新日
  - `page-content`(大阪市): 掲載ページ自体がデータ。品目表をパースした結果のハッシュ(ページのほかの部分の変更は無視)
- **作り直し**(`npm run update-data -- --all --apply`、`scripts/update-data.ts`): 目印が違う市だけ、`source.json` を更新 → 取り直し → パイプライン。品目データが変われば `data_version`・`data_fetched_at` を今日の日付に。失敗した市は git で元に戻し、ほかの市は続ける
  - 止める条件(PR にせず知らせる): 作り直しが完了条件を満たさない(未解決の区分ラベル、注意文言の欠落、`itemNotes` の品目が無い)、品目数が下限未満または前回から10%超の増減、河内長野市(PDF。テキストの取り出しとページ画像との照合が要るため `manualUpdateReason`)
  - 品目データが同じなら目印だけ更新。目印が未記録(空)で URL が同じなら、取り直さずに記録だけ
- **定期実行**(`.github/workflows/update-data.yml`): 毎週月曜 6:00(日本時間)と手動実行。変更があれば lint・テスト・データの検査・ビルドを通してからブランチ `auto/data-update-<日付>-<番号>` を push し、PR を作る(本文に変わる品目。危険物の語を含む品目の変更は先頭に出す)。ボットが作った PR の CI は GitHub の仕様で「承認待ち」で止まるので、PR を確認するときに承認して走らせる(同じ検査は見張りのワークフローの中で済ませてある)。自動で直せないものは Issue「データ更新: 対応が必要です」(開いていればコメントを足す)。前回の自動 PR が開いたままなら、今週は確認だけ
- 見張りの仕組み自体を変える PR では、確認だけを実行して動作を確かめる(何も書き換えない)
- 市のサイトへのアクセスは、確認が週1回・1市につき1回、データの取得は更新があったときだけ1回。GitHub Actions は公開リポジトリなので無料で、Claude の利用枠も使わない
- 60日間リポジトリに動きが無いと GitHub が定期実行を止める(事前にメールが来る)。`gh workflow enable update-data.yml` で再開する
- 対応の手順は `.claude/skills/update-municipality-data/SKILL.md`
