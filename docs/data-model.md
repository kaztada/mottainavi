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
