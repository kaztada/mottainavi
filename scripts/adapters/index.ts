import type { MunicipalityAdapter } from "../core/types"
import { fukuokaCityAdapter } from "./fukuoka-city"
import { higashiosakaCityAdapter } from "./higashiosaka-city"
import { hirakataCityAdapter } from "./hirakata-city"
import { hiratsukaCityAdapter } from "./hiratsuka-city"
import { kagoshimaCityAdapter } from "./kagoshima-city"
import { kawachinaganoCityAdapter } from "./kawachinagano-city"
import { maizuruCityAdapter } from "./maizuru-city"
import { nagahamaCityAdapter } from "./nagahama-city"
import { okinawaCityAdapter } from "./okinawa-city"
import { osakaCityAdapter } from "./osaka-city"
import { sukagawaCityAdapter } from "./sukagawa-city"
import { yokohamaCityAdapter } from "./yokohama-city"

/** 登録済みアダプタ。自治体を追加するときはここに1行足す */
export const ADAPTERS: Record<string, MunicipalityAdapter> = {
  [osakaCityAdapter.slug]: osakaCityAdapter,
  [yokohamaCityAdapter.slug]: yokohamaCityAdapter,
  [higashiosakaCityAdapter.slug]: higashiosakaCityAdapter,
  [hirakataCityAdapter.slug]: hirakataCityAdapter,
  [kawachinaganoCityAdapter.slug]: kawachinaganoCityAdapter,
  [hiratsukaCityAdapter.slug]: hiratsukaCityAdapter,
  [kagoshimaCityAdapter.slug]: kagoshimaCityAdapter,
  [okinawaCityAdapter.slug]: okinawaCityAdapter,
  [sukagawaCityAdapter.slug]: sukagawaCityAdapter,
  [nagahamaCityAdapter.slug]: nagahamaCityAdapter,
  [fukuokaCityAdapter.slug]: fukuokaCityAdapter,
  [maizuruCityAdapter.slug]: maizuruCityAdapter,
}
