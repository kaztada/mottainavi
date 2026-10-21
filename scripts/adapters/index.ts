import type { MunicipalityAdapter } from "../core/types"
import { fukuokaCityAdapter } from "./fukuoka-city"
import { higashiosakaCityAdapter } from "./higashiosaka-city"
import { hirakataCityAdapter } from "./hirakata-city"
import { hiratsukaCityAdapter } from "./hiratsuka-city"
import { kagoshimaCityAdapter } from "./kagoshima-city"
import { kanazawaCityAdapter } from "./kanazawa-city"
import { kawachinaganoCityAdapter } from "./kawachinagano-city"
import { koganeiCityAdapter } from "./koganei-city"
import { hofuCityAdapter } from "./hofu-city"
import { maizuruCityAdapter } from "./maizuru-city"
import { nagahamaCityAdapter } from "./nagahama-city"
import { okinawaCityAdapter } from "./okinawa-city"
import { osakaCityAdapter } from "./osaka-city"
import { oshuCityAdapter } from "./oshu-city"
import { setagayaKuAdapter } from "./setagaya-ku"
import { shunanCityAdapter } from "./shunan-city"
import { sukagawaCityAdapter } from "./sukagawa-city"
import { yamagaCityAdapter } from "./yamaga-city"
import { yokohamaCityAdapter } from "./yokohama-city"
import { niigataCityAdapter } from "./niigata-city"
import { hachiojiCityAdapter } from "./hachioji-city"
import { tottoriCityAdapter } from "./tottori-city"
import { ichinomiyaCityAdapter } from "./ichinomiya-city"
import { hiroshimaCityAdapter } from "./hiroshima-city"
import { nakanoKuAdapter } from "./nakano-ku"
import { iwakiCityAdapter } from "./iwaki-city"
import { takamatsuCityAdapter } from "./takamatsu-city"
import { fukuiCityAdapter } from "./fukui-city"
import { ubeCityAdapter } from "./ube-city"

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
  [kanazawaCityAdapter.slug]: kanazawaCityAdapter,
  [yamagaCityAdapter.slug]: yamagaCityAdapter,
  [setagayaKuAdapter.slug]: setagayaKuAdapter,
  [hofuCityAdapter.slug]: hofuCityAdapter,
  [shunanCityAdapter.slug]: shunanCityAdapter,
  [oshuCityAdapter.slug]: oshuCityAdapter,
  [koganeiCityAdapter.slug]: koganeiCityAdapter,
  [niigataCityAdapter.slug]: niigataCityAdapter,
  [hachiojiCityAdapter.slug]: hachiojiCityAdapter,
  [tottoriCityAdapter.slug]: tottoriCityAdapter,
  [ichinomiyaCityAdapter.slug]: ichinomiyaCityAdapter,
  [hiroshimaCityAdapter.slug]: hiroshimaCityAdapter,
  [nakanoKuAdapter.slug]: nakanoKuAdapter,
  [iwakiCityAdapter.slug]: iwakiCityAdapter,
  [takamatsuCityAdapter.slug]: takamatsuCityAdapter,
  [fukuiCityAdapter.slug]: fukuiCityAdapter,
  [ubeCityAdapter.slug]: ubeCityAdapter,
}
