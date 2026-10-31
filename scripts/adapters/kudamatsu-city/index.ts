import { createStandardCsvAdapter } from "../../core/standard-csv"

// 仮置き(実装で置き換える)
export const kudamatsuCityAdapter = createStandardCsvAdapter({
  slug: "kudamatsu-city",
  name: "下松市",
  encoding: "shift_jis",
  headerPrefix: "",
  expectedMinItems: 1,
  labelToId: {},
  officialLink: { tmp: "https://www.city.kudamatsu.lg.jp/kankyou/seikatsu/kankyou/kannrikakari/kateigomi.html" },
  watch: { kind: "page-content", pageUrl: "https://yamaguchi-opendata.jp/ckan/dataset/43e41e34-ab16-4a73-9928-322a00f832b5/resource/de4acc95-1fb8-4cf1-8f32-69abf0a5eb8f/download/352071_garbage_separation.csv", select: (text) => text },
})
