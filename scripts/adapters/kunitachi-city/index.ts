import { createStandardCsvAdapter } from "../../core/standard-csv"

// 仮置き(実装で置き換える)
export const kunitachiCityAdapter = createStandardCsvAdapter({
  slug: "kunitachi-city",
  name: "国立市",
  encoding: "utf-8",
  headerPrefix: "",
  expectedMinItems: 1,
  labelToId: {},
  officialLink: { tmp: "https://www.city.kunitachi.tokyo.jp/soshiki/Dept05/Div03/Sec01/gyomu/gomirecycle/kateigomi/0427/1463551453526.html" },
  watch: { kind: "page-content", pageUrl: "https://www.opendata.metro.tokyo.lg.jp/kunitachi/132152_garbage_separation.csv", select: (text) => text },
})
