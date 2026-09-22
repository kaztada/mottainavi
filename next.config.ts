import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // 旧URL(大阪市単独版)を自治体付きURLへ恒久転送する(tech-stack.md §8)
  async redirects() {
    return [
      {
        source: "/item/:id",
        destination: "/osaka-city/item/:id",
        permanent: true,
      },
      { source: "/about", destination: "/osaka-city/about", permanent: true },
    ]
  },
  // 品目詳細は自治体ごとの静的シェル1枚で描画する(全品目SSGはしない。tech-stack.md §9)
  async rewrites() {
    return [
      { source: "/:municipality/item/:id", destination: "/:municipality/item" },
    ]
  },
  // 配信データは ?v=<data_version> 付きで参照するので長期キャッシュしてよい
  async headers() {
    return [
      {
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ]
  },
}

export default nextConfig
