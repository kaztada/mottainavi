"use client"

import { useEffect } from "react"
import { saveMunicipality } from "@/lib/municipality-storage"

/** 表示中の自治体を「選んだ自治体」として保存する(次回 / から直行するため) */
export function RememberMunicipality({ slug }: { slug: string }) {
  useEffect(() => {
    saveMunicipality(slug)
  }, [slug])
  return null
}
