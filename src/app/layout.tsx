import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/react"
import { LanguageProvider } from "@/lib/i18n"
import "./globals.css"

const SITE_URL = "https://tebanashi.kaztada.eco"
const TITLE = "てばなしナビ"
const DESCRIPTION =
  "大阪市の「これ、どう手放す?」— 捨て方と、捨てる前の選択肢をまとめて調べられる非公式ナビ"

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: TITLE,
    locale: "ja_JP",
    type: "website",
    images: [{ url: "/ogp.png", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/ogp.png"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <LanguageProvider>{children}</LanguageProvider>
        <Analytics />
      </body>
    </html>
  )
}
