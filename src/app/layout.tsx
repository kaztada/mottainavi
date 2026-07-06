import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "てばなしナビ",
  description:
    "大阪市の「これ、どう手放す?」— 捨て方と、捨てる前の選択肢をまとめて調べられる非公式ナビ",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  )
}
