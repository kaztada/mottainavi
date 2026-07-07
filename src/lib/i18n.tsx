"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import uiJa from "../../data/i18n/ui.ja.json"
import uiEn from "../../data/i18n/ui.en.json"

export type Lang = "ja" | "en"

const STORAGE_KEY = "tebanashi-lang"
const DICTS: Record<Lang, Record<string, string>> = {
  ja: uiJa,
  en: uiEn,
}

const LanguageContext = createContext<{
  lang: Lang
  setLang: (lang: Lang) => void
}>({ lang: "ja", setLang: () => {} })

/**
 * 言語状態のProvider。SSG/初回レンダは常に ja(hydration mismatch回避)。
 * mount後に localStorage の保存値へ切替え、<html lang> も同期する。
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("ja")

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "en" || saved === "ja") setLang(saved)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    localStorage.setItem(STORAGE_KEY, lang)
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  return useContext(LanguageContext)
}

/**
 * UI文言の翻訳フック。t("key") または t("key", { n: 3 }) のプレースホルダ置換。
 * キー欠落時はキー名をそのまま返す(開発時に気づけるように)。
 */
export function useT() {
  const { lang } = useLang()
  return (key: string, params?: Record<string, string | number>): string => {
    let text = DICTS[lang][key] ?? DICTS.ja[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, String(v))
      }
    }
    return text
  }
}
