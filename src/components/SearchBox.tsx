"use client"

import { Search, X } from "lucide-react"
import { useT } from "@/lib/i18n"

/** 検索入力ボックス(S1/S2)。制御コンポーネント */
export function SearchBox({
  value,
  onChange,
  onFocus,
  autoFocus = true,
}: {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  autoFocus?: boolean
}) {
  const t = useT()
  return (
    <div className="relative">
      <Search
        aria-hidden
        className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted"
      />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoFocus={autoFocus}
        value={value}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("search.placeholder")}
        aria-label={t("search.ariaLabel")}
        className="w-full rounded-2xl border border-border bg-card py-3.5 pl-11 pr-11 text-base shadow-[0_1px_3px_rgba(0,0,0,0.05)] outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("search.clear")}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex size-11 items-center justify-center text-muted"
        >
          <X className="size-5" />
        </button>
      )}
    </div>
  )
}
