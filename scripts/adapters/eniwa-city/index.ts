import { createStandardCsvAdapter } from "../../core/standard-csv"

// 仮置き(実装で置き換える)
export const eniwaCityAdapter = createStandardCsvAdapter({
  slug: "eniwa-city",
  name: "恵庭市",
  encoding: "shift_jis",
  headerPrefix: "",
  expectedMinItems: 1,
  labelToId: {},
  officialLink: { tmp: "https://www.city.eniwa.hokkaido.jp/soshikikarasagasu/seikatsukankyoubu/kankyoseisakushitsu_haikibutsukanrika/gomi_recycle/10/20411.html" },
  watch: { kind: "page-content", pageUrl: "https://www.harp.lg.jp/opendata/dataset/1974/resource/8020/012319_garbage%20sorting%20dictionary.csv", select: (text) => text },
})
