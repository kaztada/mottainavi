/** 選んだ自治体の保存(localStorage)。キーは screens.md §9 */
export const MUNICIPALITY_STORAGE_KEY = "mottainavi-municipality"

/** 自治体選択ページで自動転送をしないためのクエリ(自治体を選びなおすとき) */
export const CHANGE_MUNICIPALITY_HREF = "/?change=1"

export function saveMunicipality(slug: string): void {
  try {
    localStorage.setItem(MUNICIPALITY_STORAGE_KEY, slug)
  } catch {
    // プライベートモード等で保存できなくても動作は続ける
  }
}

/**
 * 自治体選択ページ(/)の <head> 相当の位置で描画前に実行するスクリプト。
 * 保存済みの自治体があればそのページへ直行する(再訪者のタップ数を増やさない)。
 */
export const AUTO_REDIRECT_SCRIPT = `try{if(!/[?&]change=1/.test(location.search)){var s=localStorage.getItem(${JSON.stringify(
  MUNICIPALITY_STORAGE_KEY
)});if(s&&/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s))location.replace("/"+s)}}catch(e){}`
