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
tebanashi-navi/
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
