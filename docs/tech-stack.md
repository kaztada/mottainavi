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
実例: `scripts/adapters/osaka-city/`(HTML表のスクレイピング)と `scripts/adapters/yokohama-city/`(オープンデータ CSV。CP932 の復号と RFC 4180 の CSV パーサはアダプタ内に持つ)。
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
