# 🌱 もったいナビ

**「これ、どう手放す?」— ごみの捨て方と、捨てる前の選択肢をまとめて調べられる非公式ナビ**

https://mottainavi.kaztada.eco

![もったいナビ OGP](public/ogp.png)

お住まいの自治体を選んで品目名を検索すると、その自治体での分別区分・出し方に加えて、**捨てる前に検討できる選択肢**(リユース・拠点回収・寄付・買取・譲り合い)を1画面で提示します。コンセプトは「捨てる前に、ちょっとだけ立ち止まれる場所」。

## 特徴

- 🔍 **あいまい検索** — ひらがな・カタカナ・漢字・別名・英語のどれでもヒット(例:「ぎたー」「PET」「iron」)
- ♻️ **手放し導線** — 品目カテゴリに応じたリユース選択肢を、押しつけないトーンで提案
- 🗑 **正確さ優先の分別情報** — 自治体の注意文言を欠かさず表示。粗大ごみは申込先(ネット・電話)と、データにある自治体では手数料も
- 🌏 **日英切替** — UI の全文言と、品目名の一部の英訳(順次追加中)。英訳のない品目はローマ字表示でフォロー
- 📱 **モバイルファースト・静的サイト** — サーバもDBも使わない。品目データは静的な JSON として配信し、ブラウザで読み込んで表示

## 対応している自治体

| 自治体             | 出典(各自治体が公開しているデータ)                                                                                   | ライセンス   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------ |
| 大阪市(大阪府)     | [品目別収集区分一覧表](https://www.city.osaka.lg.jp/kankyo/page/0000201907.html)                                     | CC BY 4.0    |
| 横浜市(神奈川県)   | [ごみと資源物の出し方一覧表](https://www.city.yokohama.lg.jp/kurashi/sumai-kurashi/gomi-recycle/gomi/dashikata.html) | CC BY 4.0    |
| 東大阪市(大阪府)   | [ゴミの分別方法一覧](https://data.bodik.jp/dataset/272272_28)                                                        | CC BY 4.0    |
| 枚方市(大阪府)     | [ごみの分別一覧表50音順オープンデータ](https://www.city.hirakata.osaka.jp/0000024067.html)                           | CC BY 2.1 JP |
| 河内長野市(大阪府) | [家庭用ごみの分別辞典](https://www.city.kawachinagano.lg.jp/soshiki/15/1796.html)                                    | CC BY 4.0    |
| 平塚市(神奈川県)   | [ごみの分別方法一覧](https://www.city.hiratsuka.kanagawa.jp/keikaku/page81_00019.html)                               | CC BY 4.0    |
| 鹿児島市(鹿児島県) | [ごみの分別一覧](https://data.bodik.jp/dataset/462012_gomibunbetsu)                                                  | CC BY 4.0    |
| 沖縄市(沖縄県)     | [ごみの分別方法一覧](https://data.bodik.jp/dataset/472115_separate_garbage_20241201)                                 | CC BY 4.0    |
| 須賀川市(福島県)   | [ゴミの分別方法一覧](https://www.city.sukagawa.fukushima.jp/shisei/gaiyo/opendata/1004902/8865.html)                 | CC BY 4.0    |
| 長浜市(滋賀県)     | [ごみ分別表](https://data.bodik.jp/dataset/252034_garbage_separation)                                                | CC BY 4.0    |
| 福岡市(福岡県)     | [ごみの分け方（品目）検索](https://data.bodik.jp/dataset/401307_disposing-method)                                    | CC BY 4.0    |
| 舞鶴市(京都府)     | [ゴミの分別方法一覧](https://data.bodik.jp/dataset/262021_garbage_separation)                                        | CC BY 4.0    |
| 金沢市(石川県)     | [金沢市 ごみ分別辞典](https://catalog-data.city.kanazawa.ishikawa.jp/dataset/172014-gomibunbetsujiten)               | CC BY        |
| 山鹿市(熊本県)     | [家庭ごみ分別一覧](https://data.bodik.jp/dataset/432083_bunbetsu)                                                    | CC BY 4.0    |
| 世田谷区(東京都)   | [ごみ分別一覧(自治体標準オープンデータセット)](https://www.city.setagaya.lg.jp/opendata/22308.html)                  | CC BY 4.0    |
| 防府市(山口県)     | [【防府市】ゴミの分別方法一覧](https://yamaguchi-opendata.jp/ckan/dataset/352063-garbage_separation)                 | PDL1.0       |
| 周南市(山口県)     | [【周南市】ゴミの分別方法一覧](https://yamaguchi-opendata.jp/ckan/dataset/352152_garbage_separation)                 | PDL1.0       |
| 奥州市(岩手県)     | [ゴミの分別方法一覧](https://www.city.oshu.iwate.jp/opendata/8/16379.html)                                           | CC BY 4.0    |
| 小金井市(東京都)   | [ゴミの分別方法一覧](https://catalog.data.metro.tokyo.lg.jp/dataset/t132101d0000000038)                              | CC BY 4.0    |
| 新潟市(新潟県)     | [ごみ分別表](https://www.city.niigata.lg.jp/shisei/seisaku/it/open-data/opendata-tetsuduki/od-gomibunbetsuhyou.html) | CC BY 2.1 JP |
| 八王子市(東京都)   | [ゴミの分別方法一覧](https://www.city.hachioji.tokyo.jp/contents/open/002/p005873.html)                              | CC BY 4.0    |
| 鳥取市(鳥取県)     | [鳥取市ごみの分別方法一覧](https://odp-pref-tottori.tori-info.co.jp/dataset/1891.html)                               | CC BY 4.0    |
| 一宮市(愛知県)     | [資源とごみの分別に関するデータ](https://www.city.ichinomiya.aichi.jp/kankyou/haikibutsutaisaku/1043987/1043988/1000388/1060886.html) | CC BY 4.0    |
| 広島市(広島県)     | [広島市_家庭ごみ分別50音事典](https://hiroshima-opendata.dataeye.jp/datasets/1338)                                   | PDL1.0       |
| 中野区(東京都)     | [ごみ分別一覧](https://catalog.data.metro.tokyo.lg.jp/dataset/t131148d0000000139)                                    | CC BY 4.0    |
| いわき市(福島県)   | [ごみの分別](https://www.city.iwaki.lg.jp/www/contents/1001000001837/index.html)                                     | CC BY 2.1 JP |
| 福井市(福井県)     | [ごみ分別一覧](https://www.pref.fukui.lg.jp/doc/dx-suishin/list_ct_gomibunbetu.html)(福井・美山地域)                  | CC BY 4.0    |
| 宇部市(山口県)     | [【宇部市】ごみ収集](https://yamaguchi-opendata.jp/ckan/dataset/352021_garbage_collection)                             | PDL1.0       |
| 稲沢市(愛知県)     | [ゴミの分別方法一覧](https://www.city.inazawa.aichi.jp/0000003563.html)                                               | CC BY 4.0    |
| 座間市(神奈川県)   | [ごみ分別リスト](https://www.city.zama.kanagawa.jp/opendata/opendata/kenkyo/1005833.html)                             | CC BY 4.0    |
| 高松市(香川県)     | [ごみ分別一覧](https://opendata.smartcity-takamatsu.jp/ckan/dataset/garbage_separation_list)                          | CC BY 4.0    |

品目データを二次利用できるライセンスで公開している自治体から、順に追加しています。まだ対応していない自治体を選ぶと、その自治体の公式サイトへの案内を表示します。

## 技術スタック

- Next.js 15 (App Router) + TypeScript / Tailwind CSS v4
- 検索: Fuse.js(クライアントサイド・軽量インデックスを遅延ロード)
- データ検証: zod(パイプラインとアプリで共用)
- データパイプライン: TypeScript + cheerio + exceljs + kuromoji(`scripts/build-data.ts`、自治体ごとのアダプタは `scripts/adapters/`)
- ホスティング: Vercel

## 開発

```bash
npm install
npm run dev          # 開発サーバ
npm run build-data -- --municipality osaka-city   # 自治体の品目データ生成(キャッシュ優先。--refresh で再取得)
npm run build-data -- --all   # 対応しているすべての自治体の品目データを生成
npm run check-data   # 生成したデータの検査(再現性・版番号・変わる品目の一覧)
npm run build-registry   # 全国の自治体レジストリを総務省コードから再生成(通常は不要)
npm test             # Vitest(パース・検索正規化のユニットテスト)
npm run build        # 本番ビルド
```

- 配信用の `public/data/` は `npm run build` の prebuild で自動生成される
- 変更はプルリクエストで行う。CI(GitHub Actions)が lint・テスト・データの検査・ビルドを実行し、main へのマージで Vercel が自動デプロイする
- データの更新は、週1回の GitHub Actions(`.github/workflows/update-data.yml`)が各自治体の公開データを確かめ、更新があればプルリクエストか Issue を作る
- 設計書は `docs/`(要件・データ構造・画面・技術選定・ロードマップ)

## データ出典

品目データは、上の表の各自治体が公開しているデータを加工して作成しています。自治体ごとの出典の表記(各自治体の利用規約に沿った書き方)は、サイトの各品目ページと、自治体ごとの「このサイトについて」ページに表示しています。

自治体を選ぶ画面の地図は、「[国土数値情報(行政区域データ)](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2021.html)」(国土交通省、2021年版)を加工して作成しています。利用条件は[国土数値情報の利用規約](https://nlftp.mlit.go.jp/ksj/other/agreement.html)(出典の記載と、加工した旨の記載)に従います。境界を軽くしたデータは、スマートニュース メディア研究所の [japan-topography](https://github.com/smartnews-smri/japan-topography)(2021年9月28日取得の国土数値情報を加工したもの)を使っています。

- [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)
- [CC BY 2.1 JP](https://creativecommons.org/licenses/by/2.1/jp/)

**本サイトは各自治体の公式サービスではありません。** 分別ルールは変わることがあります。最新・正確な情報は、必ず各自治体の公式サイトでご確認ください。

## ライセンス

- コード: [MIT](LICENSE)
- 品目データ: 各自治体のライセンス(上の表)に従います

## 作者

Kaz Tada — [kaztada.eco](https://kaztada.eco) / #ちるエコ日和

誤りの報告・提案は [Issues](https://github.com/kaztada/mottainavi/issues) へどうぞ。
