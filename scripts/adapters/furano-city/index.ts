import { createStandardCsvAdapter } from "../../core/standard-csv"

// 仮置き(実装で置き換える)
export const furanoCityAdapter = createStandardCsvAdapter({
  slug: "furano-city",
  name: "富良野市",
  encoding: "utf-8",
  headerPrefix: "",
  expectedMinItems: 1,
  labelToId: {},
  officialLink: { tmp: "https://www.city.furano.hokkaido.jp/life/docs/2015022200404.html" },
  watch: { kind: "page-content", pageUrl: "https://www.harp.lg.jp/opendata/dataset/2228/resource/8280/%E3%81%94%E3%81%BF%E5%88%86%E5%88%A5.csv", select: (text) => text },
})
