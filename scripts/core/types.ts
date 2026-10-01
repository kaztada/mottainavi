/** アダプタが返す生レコード(1品目=複数区分行を集約済み) */
export interface RawItem {
  name_ja: string
  rows: RawDispositionRow[]
}

export interface RawDispositionRow {
  /** 自治体の表記そのままの区分ラベル */
  category_label: string
  note: string | null
  official_link: string | null
}

/**
 * 自治体アダプタの契約(tech-stack.md §11)。
 * 取得手段(オープンデータ/HTML/手作業JSON)の違いはアダプタの中に閉じ込め、
 * 共通パイプライン(core/pipeline.ts)は自治体を知らない。
 */
export interface MunicipalityAdapter {
  slug: string
  /** 原本を取得する。キャッシュ優先(refresh=true のときだけ再取得) */
  fetchSource(opts: {
    refresh: boolean
  }): Promise<{ source: string; fromCache: boolean; location: string }>
  /** 原本 → 生レコード */
  parse(source: string): RawItem[]
  /** 区分ラベル → この自治体の区分ID。未知ラベルは null */
  resolveCategoryId(label: string): string | null
  /** 品目数がこれを下回ったらパーサ破損を疑って警告する */
  expectedMinItems: number
  /** データ更新の見張り方(tech-stack.md §17)。無ければ見張らない */
  watch?: WatchSpec
  /** 更新を検出しても自動では作り直せない理由(あれば、作り直さずに知らせる) */
  manualUpdateReason?: string
}

/** データ更新の検出方法。週1回、対象を1回だけ取得して前回の目印(fingerprint)と比べる */
export type WatchSpec =
  /** BODIK(CKAN)の API。いちばん新しい CSV のリソースの URL と更新日時を見る */
  | { kind: "ckan"; api: string; resourceName?: RegExp }
  /** 掲載ページの中の、データファイルへのリンク(リンクの文言で特定する) */
  | { kind: "page-link"; pageUrl: string; linkText: RegExp }
  /** ページ自体がデータ。select で選んだ内容のハッシュを見る */
  | { kind: "page-content"; pageUrl: string; select: (html: string) => string }
