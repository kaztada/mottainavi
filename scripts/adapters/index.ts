import type { MunicipalityAdapter } from "../core/types"
import { osakaCityAdapter } from "./osaka-city"
import { yokohamaCityAdapter } from "./yokohama-city"

/** 登録済みアダプタ。自治体を追加するときはここに1行足す */
export const ADAPTERS: Record<string, MunicipalityAdapter> = {
  [osakaCityAdapter.slug]: osakaCityAdapter,
  [yokohamaCityAdapter.slug]: yokohamaCityAdapter,
}
