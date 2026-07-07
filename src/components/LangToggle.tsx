"use client"

import { useLang, useT } from "@/lib/i18n"

/** 言語トグル(右上)。表示は切替先の言語名 */
export function LangToggle() {
  const { lang, setLang } = useLang()
  const t = useT()
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "ja" ? "en" : "ja")}
      aria-label={lang === "ja" ? "Switch to English" : "日本語に切り替え"}
      className="min-h-11 shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-medium text-accent-strong active:bg-accent-soft"
    >
      {t("lang.toggle")}
    </button>
  )
}
