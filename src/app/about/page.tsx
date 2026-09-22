import type { Metadata } from "next"
import { AboutShell } from "@/components/AboutShell"
import { getMunicipality } from "@/lib/data"

export const metadata: Metadata = {
  title: "このサイトについて | もったいナビ",
  description:
    "もったいナビは、大阪市のごみ分別検索に「捨てる前の選択肢」を添えた非公式ツールです。出典・ライセンス・運営者について。",
}

export default function AboutPage() {
  return <AboutShell municipality={getMunicipality()} />
}
