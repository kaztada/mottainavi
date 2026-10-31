import { createStandardCsvAdapter } from "../../core/standard-csv"

// 仮置き(実装で置き換える)
export const tsubataTownAdapter = createStandardCsvAdapter({
  slug: "tsubata-town",
  name: "津幡町",
  encoding: "utf-8",
  headerPrefix: "",
  expectedMinItems: 1,
  labelToId: {},
  officialLink: { tmp: "https://www.town.tsubata.lg.jp/page/1363.html" },
  watch: { kind: "page-content", pageUrl: "https://catalog-data.city.kanazawa.ishikawa.jp/dataset/f41e8520-448a-4e4d-aa7f-62414e83b5f2/resource/f3816215-fe4b-493f-8933-4f41d61b3359/download/173614_recycle_separation.csv", select: (text) => text },
})
