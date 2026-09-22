# data-model.md — データモデル設計書

バージョン: v0.1 (2026-07-04)

---

## 1. 設計方針

- **3層構造**: 「品目」「自治体別ルール」「手放し導線」を分離し、将来の自治体追加・多言語追加に耐える
- MVPはDB不使用。**ビルド時に読み込む静的JSON**として保持(SSG)
- すべてのデータファイルは `data/` ディレクトリに配置し、パイプラインスクリプトで生成

```
data/
├── municipalities.json        # 自治体マスタ
├── items/
│   └── osaka-city.json        # 品目+ルール(大阪市)※パイプライン生成
├── reuse-options.json         # 手放し導線マスタ(手動管理)
├── i18n/
│   ├── ui.ja.json             # UI文言(日本語)
│   ├── ui.en.json             # UI文言(英語)
│   └── items.en.json          # 品目名英訳(主要300件)※半自動生成
└── categories.json            # 収集区分マスタ(色・アイコン・多言語名)
```

## 2. スキーマ定義

### 2.1 municipalities.json(自治体マスタ)

```json
[
  {
    "id": "osaka-city",
    "name_ja": "大阪市",
    "name_en": "Osaka City",
    "official_url": "https://www.city.osaka.lg.jp/kurashi/category/3016-1-2-0-0-0-0-0-0-0.html",
    "source_url": "https://www.city.osaka.lg.jp/kankyo/page/0000201907.html",
    "source_license": "CC-BY 4.0",
    "source_attribution": "出典: 大阪市「品目別収集区分一覧表」(CC-BY 4.0)",
    "sodai_apply_url": "https://ecolife.e-tumo.jp/kankyo-osaka-u/",
    "sodai_tel_landline": "0120-79-0053",
    "sodai_tel_mobile": "06-6530-1530",
    "data_fetched_at": "2026-07-05"
  }
]
```

### 2.2 categories.json(収集区分マスタ)

大阪市の実データから確認された区分をenum化。色は画面設計と連動。

```json
[
  { "id": "futsu",        "name_ja": "普通ごみ",              "name_en": "Regular Waste",              "color": "#8E8E93", "icon": "trash" },
  { "id": "shigen",       "name_ja": "資源ごみ",              "name_en": "Recyclables (Cans/Bottles/PET)", "color": "#34C759", "icon": "recycle" },
  { "id": "plastic",      "name_ja": "プラスチック資源",       "name_en": "Plastic Resources",          "color": "#FF9F0A", "icon": "package" },
  { "id": "koshi-irui",   "name_ja": "古紙・衣類",            "name_en": "Paper & Clothing",           "color": "#5AC8FA", "icon": "shirt" },
  { "id": "sodai",        "name_ja": "粗大ごみ",              "name_en": "Bulky Waste (fee required)", "color": "#AF52DE", "icon": "sofa" },
  { "id": "kogata-kaden", "name_ja": "小型家電リサイクル回収", "name_en": "Small Appliance Recycling",  "color": "#007AFF", "icon": "smartphone" },
  { "id": "kogata-kaden-takuhai", "name_ja": "小型家電リサイクル回収(宅配便)", "name_en": "Small Appliance Recycling (Courier)", "color": "#007AFF", "icon": "truck" },
  { "id": "pc-recycle",   "name_ja": "パソコンリサイクル回収", "name_en": "PC Recycling",               "color": "#007AFF", "icon": "laptop" },
  { "id": "kyoten",       "name_ja": "拠点回収",              "name_en": "Collection Point Drop-off",  "color": "#00C7BE", "icon": "map-pin" },
  { "id": "li-ion",       "name_ja": "リチウムイオン電池等の回収", "name_en": "Li-ion Battery Collection", "color": "#FF3B30", "icon": "battery" },
  { "id": "not-collected","name_ja": "収集しません",          "name_en": "Not Collected by City",      "color": "#1C1C1E", "icon": "x-circle" }
]
```

注: 1品目が複数区分を持つケースがある(例: IHクッキングヒーター → 小型家電リサイクル(宅配) or 粗大ごみ)。品目側は**区分の配列**で持つ。

### 2.3 items/osaka-city.json(品目+ルール)

パイプラインが市の一覧表HTMLから生成。1レコード=1品目行。

```json
{
  "municipality_id": "osaka-city",
  "generated_at": "2026-07-05T09:00:00+09:00",
  "source_url": "https://www.city.osaka.lg.jp/kankyo/page/0000201907.html",
  "item_count": 1234,
  "items": [
    {
      "id": "osk-0001",
      "name_ja": "アイロン",
      "name_kana": "あいろん",
      "aliases": ["スチームアイロン", "iron"],
      "dispositions": [
        {
          "category_id": "futsu",
          "note_ja": "最大の辺または径が30cmを超えるものは粗大ごみ収集受付センターへお申込みください。",
          "official_link": "https://www.city.osaka.lg.jp/kankyo/page/0000009139.html"
        }
      ],
      "sodai_fee_yen": null,
      "reuse_category": "small-appliance",
      "name_en": "Iron (clothes iron)"
    }
  ]
}
```

フィールド仕様:

| フィールド | 型 | 生成方法 |
|---|---|---|
| id | string | パイプラインで連番付与(`osk-` + 4桁) |
| name_ja | string | HTML「品目(素材など)」列そのまま |
| name_kana | string | パイプラインでかな変換(kuromoji等)。検索正規化用 |
| aliases | string[] | 別名辞書(手動管理 `data/aliases.json`)からマージ |
| dispositions | array | 同一品目の複数行を1品目に集約。区分・ポイント・公式リンク |
| sodai_fee_yen | number/null | ポイント欄の「処理手数料 1台400円」等を正規表現抽出 |
| reuse_category | string/null | ヒューリスティック(§4)+手動上書きで付与 |
| name_en | string/null | 主要300品目のみ。i18n/items.en.json からマージ |

### 2.4 reuse-options.json(手放し導線マスタ)— このアプリの魂

品目に直接ぶら下げず、**reuse_category 経由で疎結合**にする(メンテ容易性)。

```json
[
  {
    "id": "clothing",
    "label_ja": "衣類・ファッション",
    "label_en": "Clothing & Fashion",
    "options": [
      {
        "type": "official",
        "title_ja": "大阪市の拠点回収(マタニティ・ベビー・子ども服)",
        "title_en": "City collection points (maternity/baby/kids clothing)",
        "desc_ja": "使用可能なものは環境事業センターで回収し、展示提供されています。",
        "url": "https://www.city.osaka.lg.jp/kankyo/page/0000009050.html",
        "effort": "medium", "money": "free"
      },
      {
        "type": "resale",
        "title_ja": "フリマアプリ・リサイクルショップで売る",
        "title_en": "Sell via flea market apps or secondhand shops",
        "desc_ja": "状態の良いものは次の着る人へ。",
        "url": null,
        "effort": "medium", "money": "earn"
      },
      {
        "type": "donation",
        "title_ja": "衣類回収・寄付プログラムに出す",
        "title_en": "Donate through clothing collection programs",
        "desc_ja": "店頭回収(ユニクロ・H&M等)や寄付団体の宅配回収など。",
        "url": null,
        "effort": "low", "money": "free"
      }
    ]
  },
  {
    "id": "small-appliance",
    "label_ja": "小型家電",
    "label_en": "Small Appliances",
    "options": [
      { "type": "official", "title_ja": "小型家電リサイクル回収(市の回収ボックス/宅配便)", "title_en": "City small-appliance recycling (drop box / courier)", "desc_ja": "資源として回収されます。", "url": "https://www.city.osaka.lg.jp/kankyo/page/0000523872.html", "effort": "low", "money": "free" },
      { "type": "resale", "title_ja": "動くものは買取・フリマへ", "title_en": "Working items: sell or trade in", "desc_ja": "製造5年以内なら値がつくことも。", "url": null, "effort": "medium", "money": "earn" }
    ]
  },
  { "id": "furniture", "label_ja": "家具", "label_en": "Furniture", "options": [
      { "type": "give", "title_ja": "地域の譲り合い(ジモティー等)", "title_en": "Local giveaway platforms", "desc_ja": "粗大ごみ手数料を払う前に、もらい手を探す選択肢。", "url": null, "effort": "medium", "money": "free" },
      { "type": "resale", "title_ja": "出張買取・リサイクルショップ", "title_en": "Secondhand furniture buyers", "desc_ja": "ブランド家具・状態良好なら買取対象に。", "url": null, "effort": "medium", "money": "earn" }
  ]},
  { "id": "books-media", "label_ja": "本・メディア", "label_en": "Books & Media", "options": [
      { "type": "resale", "title_ja": "古本買取・宅配買取", "title_en": "Used book buyback", "desc_ja": "段ボールに詰めて送るだけの宅配買取も。", "url": null, "effort": "low", "money": "earn" },
      { "type": "donation", "title_ja": "図書施設・団体への寄贈", "title_en": "Donate to libraries/charities", "desc_ja": "地域の文庫や寄付プログラムへ。", "url": null, "effort": "medium", "money": "free" }
  ]},
  { "id": "toys-baby", "label_ja": "おもちゃ・ベビー用品", "label_en": "Toys & Baby Goods", "options": [
      { "type": "official", "title_ja": "大阪市の拠点回収(絵本など)", "title_en": "City collection points (picture books etc.)", "desc_ja": "絵本は拠点回収で次の読み手へ。", "url": "https://www.city.osaka.lg.jp/kankyo/page/0000009050.html", "effort": "low", "money": "free" },
      { "type": "give", "title_ja": "おさがり・譲り合い", "title_en": "Hand-me-downs & giveaways", "desc_ja": "地域コミュニティや知人へ。", "url": null, "effort": "low", "money": "free" }
  ]},
  { "id": "instruments", "label_ja": "楽器", "label_en": "Musical Instruments", "options": [
      { "type": "resale", "title_ja": "楽器店の買取・下取り", "title_en": "Instrument shop trade-in", "desc_ja": "楽器は循環市場が成熟。捨てるのは最後の手段に。", "url": null, "effort": "medium", "money": "earn" }
  ]},
  { "id": "returnable", "label_ja": "リターナブル容器", "label_en": "Returnable Containers", "options": [
      { "type": "official", "title_ja": "購入店・販売店へ返却", "title_en": "Return to the retailer", "desc_ja": "ビールびん・一升びんは再使用(リユース)されます。", "url": null, "effort": "low", "money": "free" }
  ]}
]
```

`effort`(手間: low/medium/high)と `money`(free/earn/cost)は、画面でユーザーが直感的に選べるようにするための属性。

### 2.5 aliases.json(別名辞書・手動管理)

```json
{
  "ペットボトル": ["PET", "ペット", "plastic bottle"],
  "スマートフォン": ["スマホ", "携帯", "iPhone", "Android"],
  "テレビ": ["TV", "液晶テレビ"]
}
```

## 3. データパイプライン仕様(scripts/build-data.ts)

1. **fetch**: 大阪市「品目別収集区分一覧表」ページのHTML取得(ローカルにキャッシュ保存。再実行時はキャッシュ優先オプション)
2. **parse**: テーブル行を抽出 → { name_ja, category_label, note, links } の生配列に
   - rowspanで品目名が空の行(複数区分)は直前の品目に集約
   - 区分ラベル→category_id のマッピング表で正規化。未知ラベルは警告出力
3. **enrich**:
   - name_kana 生成(形態素解析 or 簡易かな変換)
   - sodai_fee_yen 抽出(正規表現: `処理手数料.*?([\d,]+)円`)
   - reuse_category 付与(§4のルール)
   - aliases.json / items.en.json をマージ
4. **validate**: 件数チェック(±10%超の変動で警告)、必須フィールド欠損チェック、category_id未解決の一覧出力
5. **emit**: `data/items/osaka-city.json` 書き出し + 統計サマリをコンソール表示

## 4. reuse_category 付与ヒューリスティック

| 条件(品目名/区分) | reuse_category |
|---|---|
| 名前に「衣」「服」「ウェア」/ 区分=古紙・衣類(衣類系) | clothing |
| 区分に kogata-kaden 系を含む | small-appliance |
| 区分=sodai かつ 名前に「いす/棚/机/タンス/ベッド/ソファ」等 | furniture |
| 名前に「本/書/雑誌/CD/DVD/レコード」 | books-media |
| 名前に「おもちゃ/ベビー/絵本/乳母車」 | toys-baby |
| 名前に「ギター/ピアノ/オルガン/楽器」 | instruments |
| ポイント欄に「リターナブル/購入店・販売店へ返却」 | returnable |
| 上記以外 | null(手放し導線セクション非表示) |

自動付与の結果は `data/reuse-overrides.json` で個別上書き可能にする。

## 5. 多言語データ方針

- UI文言: `ui.ja.json` / `ui.en.json` の完全対訳(キーは共通)
- 品目名英訳: 検索頻度が高そうな300品目を `items.en.json` に整備(Claude Codeで下訳生成 → Kazがレビュー)。英訳が無い品目は日本語名表示+区分・注意点は英語UI文言でフォロー
- 検索は日英どちらの入力でもヒットするよう、Fuse.jsのkeysに name_ja / name_kana / aliases / name_en を含める

---

# 全国展開対応(v0.2 / 2026-09-22 承認)

以下は Phase A(土台改修)で導入するデータ構造。§1〜§5 は大阪市単独時点の記述であり、
矛盾する箇所はこの §6 以降が優先する。

## 6. 設計方針の変更点

| 論点 | v0.1(大阪市のみ) | v0.2(全国) |
|---|---|---|
| 収集区分 | 全自治体共通の enum 12種 | 自治体ごとに定義+アプリ共通の `kind`(意味種別)を必須付与 |
| 品目ID | `osk-` + パース順の連番 | prefix は自治体属性。`id-map.json` で品目名↔IDを固定 |
| データ配置 | `data/items/<muni>.json` をバンドルに同梱 | `data/municipalities/<muni>/` に原本、`public/data/<muni>/` に配信用を導出 |
| 手放し導線 | 全品目共通 | `municipality_id` を持つ選択肢は該当自治体でのみ表示 |
| UI文言 | 「大阪市」をベタ書き | `{municipality}` プレースホルダ |

## 7. ディレクトリ構成

```
data/
├── municipalities.json                  # 全国レジストリ(1,741件。git管理)
├── municipalities/
│   └── osaka-city/
│       ├── municipality.json            # 出典・ライセンス・粗大申込先・取得日・prefix
│       ├── categories.json              # この自治体の収集区分
│       ├── items.json                   # パイプライン出力(整形済み。差分レビュー用)
│       ├── id-map.json                  # 品目名 → 品目ID(追記専用)
│       ├── aliases.json                 # 別名辞書(自治体固有分。任意、共通辞書より優先)
│       ├── reuse-overrides.json
│       └── items.en.json                # 品目名英訳(自治体固有分。任意、共通より優先)
├── reuse-options.json                   # 手放し導線マスタ(全国共通+自治体別)
├── aliases.common.json                  # 全国共通の別名辞書(品目名に対する別名。自治体を問わない)
├── cache/                               # 原本キャッシュ(<slug>.html、soumu-lg-code.xlsx)
└── i18n/ui.ja.json, ui.en.json, items.en.json(全国共通の品目名英訳)

public/data/                             # prebuild で導出(.gitignore)
└── osaka-city/
    ├── search.json                      # 検索インデックス(gzip 約34KB)
    └── items/00.json … 31.json          # 詳細用シャード(1本あたり gzip 約4KB)
```

原本は `data/` のみ。`public/data/` は `npm run build` の prebuild で毎回生成するため、
二重管理にならない。

## 8. municipalities.json(全国レジストリ)

全国1,741市区町村(市町村1,718+特別区23)を1ファイルで持つ。総務省「全国地方公共団体コード」から
`scripts/build-registry.ts` で一度生成し、以後は `status` と `slug` を手で保守する。

```json
[
  {
    "slug": "osaka-city",
    "lg_code": "271004",
    "pref": "大阪府",
    "name_ja": "大阪市",
    "name_en": "Osaka City",
    "status": "supported",
    "official_url": "https://www.city.osaka.lg.jp/kurashi/category/3016-1-2-0-0-0-0-0-0-0.html"
  },
  {
    "slug": "osaka-sakai-city",
    "lg_code": "271403",
    "pref": "大阪府",
    "name_ja": "堺市",
    "name_en": "Sakai City",
    "status": "unsupported",
    "official_url": null
  }
]
```

| フィールド | 仕様 |
|---|---|
| slug | URL に出る自治体ID。`^[a-z0-9-]+$`。レジストリ内で一意(zod + 重複検査で保証) |
| lg_code | 全国地方公共団体コード6桁。オープンデータ連携の主キー |
| status | `supported`(品目データあり) / `unsupported`(未対応) |
| official_url | 未対応自治体でも判明していれば入れる。無ければ null |

**同名自治体の slug 衝突**: 府中市(東京都/広島県)、伊達市(北海道/福島県)など。
衝突する場合のみ都道府県を前置する(`tokyo-fuchu-city` / `hiroshima-fuchu-city`)。
衝突しない自治体に都道府県は付けない(既存の `osaka-city` を変えないため)。

## 9. 自治体別 municipality.json

v0.1 の municipalities.json 1件ぶんに相当。粗大ごみの申込先など自治体固有情報を持つ。

```json
{
  "slug": "osaka-city",
  "item_id_prefix": "osk",
  "source_url": "https://www.city.osaka.lg.jp/kankyo/page/0000201907.html",
  "source_type": "html-table",
  "source_license": "CC-BY 4.0",
  "source_attribution": "出典: 大阪市「品目別収集区分一覧表」(CC-BY 4.0)",
  "source_attribution_en": "Source: Osaka City \"Item Collection Category List\" (CC-BY 4.0)",
  "sodai_apply_url": "https://ecolife.e-tumo.jp/kankyo-osaka-u/",
  "sodai_tel_landline": "0120-79-0053",
  "sodai_tel_mobile": "06-6530-1530",
  "data_fetched_at": "2026-07-06",
  "data_version": "20260706"
}
```

- `source_type`: `opendata-csv` / `html-table` / `manual`。取得手段の由来を必ず記録する
- `data_version`: 配信JSONのキャッシュバスター(`?v=` クエリ)に使う
- 粗大ごみ制度が無い自治体もあるため、`sodai_*` はすべて任意(null 可)

## 10. categories.json の自治体別化と kind

区分IDは自治体ごとの自由文字列(`^[a-z0-9-]+$`)にし、アプリ共通の `kind` を必須にする。
**UIロジックとパイプラインは区分IDではなく kind で判定する**。

kind の enum(アプリ側固定):

| kind | 意味 | アプリ側の挙動 |
|---|---|---|
| burnable | 可燃・普通ごみ | — |
| non-burnable | 不燃ごみ | — |
| recyclable | 資源(缶・びん・PET) | — |
| plastic | プラスチック資源 | — |
| paper | 古紙・紙類(衣類含む場合あり) | — |
| bulky | 粗大ごみ | 詳細ページに申込セクション(手数料・申込URL・電話)を表示 |
| small-appliance | 小型家電・PC等のリサイクル回収 | reuse_category を `small-appliance` と推定 |
| maker-recycle | メーカー・販売店による回収(パソコンリサイクル等) | small-appliance の推定をしない(市の小型家電回収と別制度) |
| hazardous | 電池・スプレー缶など危険物 | — |
| drop-off | 拠点回収・集団回収 | — |
| not-collected | 市が収集しない | 注意文言の欠落をパイプラインが警告(誤案内リスク最大) |
| other | 上記に当てはまらない | — |

色とアイコンは kind ごとの既定値をコード側(`src/lib/category-kind.ts`。クライアントでも読むため zod 非依存)に持ち、
自治体の categories.json で任意に上書きできる。既定値は現行の大阪市の配色をそのまま採用するため、
Phase A で見た目は変わらない。

大阪市の categories.json(kind 付与後):

| 区分ID | name_ja | kind |
|---|---|---|
| futsu | 普通ごみ | burnable |
| shigen | 資源ごみ | recyclable |
| plastic | プラスチック資源 | plastic |
| koshi-irui | 古紙・衣類 | paper |
| sodai | 粗大ごみ | bulky |
| kogata-kaden | 小型家電リサイクル回収 | small-appliance |
| kogata-kaden-takuhai | 小型家電リサイクル回収(宅配便) | small-appliance |
| pc-recycle | パソコンリサイクル回収 | maker-recycle |
| kyoten | 拠点回収 | drop-off |
| shudan-kaishu | 資源集団回収 | drop-off |
| li-ion | リチウムイオン電池等の回収 | hazardous |
| not-collected | 収集しません | not-collected |

品目の `category_id` がその自治体の categories.json に存在することを、
パイプラインの validate とアプリのデータ読み込み時の双方で検証する。

## 11. 品目IDの安定化(id-map.json)

**v0.1 の不具合**: パース順の連番で採番していたため、市が一覧表に1行追加すると
以降の全IDがずれ、公開済みURLが別の品目を指す(誤案内)。Phase A で修正する。

```json
{
  "prefix": "osk",
  "next_seq": 1057,
  "map": { "アイロン": "osk-0001", "アイスノン": "osk-0002" }
}
```

- パイプラインは品目名で `map` を引き、既存品目は同じIDを再利用する
- 未登録の品目のみ `next_seq` から採番し、`map` に追記する
- 削除された品目のエントリは残す(IDの再利用を防ぐ)。再登場時に同じIDへ戻る
- 既存の1,056件は現行 items.json の値でそのまま初期化するため、公開中のURLは変わらない
- スキーマは `^[a-z0-9]{2,8}-\d{4}$`(prefix は自治体属性)

## 12. 配信データとシャード

| ファイル | 内容 | サイズ(大阪市実測) |
|---|---|---|
| `public/data/<muni>/search.json` | 検索インデックス(現行と同形式) | 200KB / gzip 34KB |
| `public/data/<muni>/items/NN.json` | 詳細データ。`NN = 連番 % 32` | 1本あたり約33品目 / gzip 約4KB |
| `public/data/municipalities.json` | 自治体選択UI用のレジストリ(slug・都道府県・名前・status のみ) | gzip 約29KB |

詳細ページは品目IDからシャード番号を計算し、該当する1本だけを fetch する。
`?v=<data_version>` を付け、`/data/*` には長期キャッシュヘッダを設定する。

## 13. 手放し導線の自治体別フィルタ

`reuse-options.json` の選択肢に任意の `municipality_id` を追加する。
値があればその自治体でのみ表示し、無ければ全国共通として扱う。

現状 `type: "official"` の4件(大阪市の拠点回収URL)に `"osaka-city"` を付与する。
これを行わないと、2つ目の自治体で大阪市の回収拠点を案内してしまう。

## 14. UI文言のプレースホルダ化

`ui.ja.json` / `ui.en.json` に含まれる「大阪市」のベタ書き7箇所を
`{municipality}` に置き換え、描画時に自治体名を差し込む。

対象キー: `app.tagline` / `search.noResultsHint` / `item.disposalHeading` /
`footer.checkOfficial` / `about.purposeBody` / `about.unofficialBody` / `about.sourceBody`

## 15. Phase A 実装で確定した事項(2026-09-23)

設計(§6〜§14)から、実装時に次の点を確定・変更した。

- **kind は12種**: `maker-recycle`(メーカー回収)を追加。大阪市のパソコンリサイクル7品目は従来どおり手放し導線なし(市の小型家電回収を誤案内しないため)
- **レジストリは1,741件**: 総務省データの1,747件から、団体コードはあるが行政事務を行っていない北方領土の6村を除外
- **slug の生成規則**(`scripts/registry/slug.ts`):
  - カナ読みから種別の読み(し/ちょう/まち/むら/そん/く)を除いてローマ字化し、`-city` `-town` `-village` `-ku` を付ける
  - 長音は慣用表記に寄せる(おお→o、おう→o、うう→u。例 おおさか→osaka、とうきょう→tokyo)
  - 同名(同じslug)の自治体は都道府県を前置する。堺市は福井県の坂井市と衝突するため `osaka-sakai-city`
  - 同じ都道府県内で読みまで同じ江差町・枝幸町は、振興局名で手動指定(`hokkaido-hiyama-esashi-town` / `hokkaido-soya-esashi-town`)
  - **一度公開した slug は変えない**: 再生成時は団体コードが一致する既存エントリの slug・status・official_url を引き継ぐ
  - 予約語(about / item / data / api など、URL第1階層と衝突する語)はスキーマ検証で拒否
- **official_url はレジストリ側に持つ**(未対応自治体にも公式URLを入れられるように)。municipality.json には持たない
- **出典表記の英語版** `source_attribution_en` を municipality.json に追加
- **別名辞書と品目名英訳は全国共通を基本**にした(品目名に対する辞書で、自治体に依存しないため)。自治体固有分は任意ファイルで上書き
- **レジストリ生成の出典**: 総務省「都道府県コード及び市区町村コード」(令和6年1月1日更新、Excel)。`npm run build-registry` で再生成

## 16. Phase B(横浜市)で確定した事項(2026-09-23)

- **横浜市の出典**: オープンデータポータル「ごみの分別を調べる」の CSV「ごみと資源物の出し方一覧表」(CC BY 4.0、CP932)。3,413品目、列は `ID, 頭文字, 品目名, 小型家電回収対象, 出し方, 出し方のポイント`。市の ID を品目ID(`yok-<4桁>`)にそのまま使い、id-map を初期化した
- **出典表記**: 横浜市の規約に従い「出典: 横浜市「ごみと資源物の出し方一覧表」(CC BY 4.0)を加工して利用」(改変した旨を含める)
- **自治体固有の事情はアダプタと自治体データで吸収する**(core・アプリは変えない)という原則が成立した。方法:
  - 「出し方」28種のうち1〜4件しかない個別指示(「最寄りの警察署に相談」等)は区分 `kobetsu`(kind other「個別の出し方」)にまとめ、**市の表記を注意文言の先頭に「出し方: …。」として残す**。複合表記(「販売店または缶・びん・ペットボトル」)や古紙4種も同じ方法で主区分に寄せる。情報は落とさない
  - 古布は kind `paper` に icon `shirt`・色を上書き(kind は増やさない)。kind 12種で足りた
  - 「小型家電回収対象◎」は2つ目の区分行「小型家電回収ボックス」(kind small-appliance)として合成
  - 行に公式リンクが無いため区分ごとの市ページURLを official_link に付ける
  - 注意文言の HTML は `<a href>` → `本文(URL)`、`<br>` → 改行に変換し、文言は変えない
  - 家電リサイクルの品目には「市では収集しません」を添える(市の「市では収集できないごみ」ページに基づく。kind not-collected の注意文言必須チェックを満たす)
- **堺市**: 品目一覧はオープンデータでなく、利用を許すライセンスがどこにも示されていない(市サイトの著作権ページは無断複製・転用不可、配信元の「WEB版さんあ〜る」にも利用条件の記載なし。データの権利者は市)ため投入していない。未対応ページからは市公式の分別辞典(さんあ〜る)へ案内する。市への相談(CC BY での公開依頼)は、他の自治体がある程度そろってから行う(Kaz 方針 2026-09-23)

## 17. 東大阪市(Phase C-1)で確定した事項(2026-09-23)

- **出典**: BODIK「ゴミの分別方法一覧」(CC BY 4.0、UTF-8 CSV、913品目)。市の品目IDが空のため、品目IDは id-map で品目名から採番(`hso-0001`〜)
- **区分**: 18種の表記を12区分に寄せた。表記ゆれ(「かんびん」「家庭ごみ(もえるもの）」等)はアダプタの category-map で吸収。回収協力店の種類・個別指示は横浜市と同じく「出し方: …。」を注意文言の先頭に残す
- **「不可」**(市では収集しない116品目)は kind not-collected。注意点の有無にかかわらず「市では収集しません。」を先頭に必ず入れる
- **アプリ側の小さな一般化**(自治体が増えて見えた問題。大阪市・横浜市の内容は変わらない):
  - 大型ごみの電話が固定・携帯で同じ番号(または片方だけ)なら「電話で申込む」1ボタンにする
  - 申込セクションの見出しに自治体の区分名を入れる(「大型ごみは事前申込みが必要です」)
  - 注意文言の URL 抽出を ASCII に限り、直後の全角かっこ・句点をリンクに含めない(`src/lib/note-links.ts`)。既存2市のリンク360件は変化なし
  - 注意文言のない品目で、公式リンクが区分バッジの横に並ぶ崩れを直した(リンクを必ず次の行に)
- CSV パーサは横浜市アダプタの `csv.ts` を参照している。3つ目の CSV 自治体(寝屋川市・泉大津市)で core への移動を判断する

## 18. 枚方市(Phase C-2)で確定した事項(2026-09-23)

- **出典**: 市サイト「ごみの分別一覧表50音順オープンデータ」(xlsm、CC BY 2.1、1,763行→1,761品目)。出典表記は市の指定「[データのタイトル]、枚方市、クリエイティブ・コモンズ・ライセンス 表示 2.1」に加工した旨を添える
- **Excel の読み込み**: アダプタ契約の parse は同期のため、exceljs による非同期の読み込みは fetchSource で済ませ、行を JSON 文字列にして渡す(core は変えない)
- **粗大ごみ = 粗ごみ(無料)+大型ごみ(有料)**で、どちらも予約センターへの申込制(市ページで確認)。両方とも kind bulky にして申込セクションを出す。「粗ごみ・大型ごみ」(サイズ判断品目)は1区分にまとめ、市ページの定義(1メートル未満は粗ごみ、以上は大型ごみ)を注意文言の先頭に置く
- **区分名の手数料**: 「大型ごみ600円」の金額を「処理手数料 600円(指定品目)。」として注意文言の先頭に置き、共通の手数料抽出で詳細ページに表示(50品目)
- **1セル複数区分**: 改行区切りのセルはカードを分ける。「一般ごみ・粗ごみ」のような「条件によってどちらか」の組み合わせ表記も分け、市の表記を1枚目に残す。品目ごとの注意点は1枚目、2枚目以降は区分の説明だけ
- **処理困難物・市で処理しないもの・家電リサイクル品目**は kind not-collected。区分の説明は、市の注意点に同じ内容があれば重ねない
- **品目名**: 改行は1行にまとめ、2行目が手続きの説明(「粗大ごみ予約センターに申し込みが必要」)なら注意文言へ。同名の2行(条件違い)は1品目にまとめて条件ごとのカードにする
- 申込セクションの見出しは、区分名の末尾のかっこ書きを外して使う(「粗ごみ・大型ごみは事前申込みが必要です」)
