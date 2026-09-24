import type { MunicipalityAdapter } from "../core/types"
import { higashiosakaCityAdapter } from "./higashiosaka-city"
import { hirakataCityAdapter } from "./hirakata-city"
import { hiratsukaCityAdapter } from "./hiratsuka-city"
import { kawachinaganoCityAdapter } from "./kawachinagano-city"
import { osakaCityAdapter } from "./osaka-city"
import { yokohamaCityAdapter } from "./yokohama-city"

/** 登録済みアダプタ。自治体を追加するときはここに1行足す */
export const ADAPTERS: Record<string, MunicipalityAdapter> = {
  [osakaCityAdapter.slug]: osakaCityAdapter,
  [yokohamaCityAdapter.slug]: yokohamaCityAdapter,
  [higashiosakaCityAdapter.slug]: higashiosakaCityAdapter,
  [hirakataCityAdapter.slug]: hirakataCityAdapter,
  [kawachinaganoCityAdapter.slug]: kawachinaganoCityAdapter,
  [hiratsukaCityAdapter.slug]: hiratsukaCityAdapter,
}
