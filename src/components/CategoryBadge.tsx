"use client"

import {
  Battery,
  CircleHelp,
  Laptop,
  MapPin,
  Newspaper,
  Package,
  PackageX,
  Recycle,
  Shirt,
  Smartphone,
  Sofa,
  Trash2,
  TriangleAlert,
  Truck,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import { resolveCategoryStyle } from "@/lib/category-kind"
import type { Category } from "@/lib/schemas"
import { useLang } from "@/lib/i18n"

// categories.json / kind 既定値の icon 名 → lucide コンポーネント
const ICONS: Record<string, LucideIcon> = {
  trash: Trash2,
  recycle: Recycle,
  package: Package,
  "package-x": PackageX,
  shirt: Shirt,
  newspaper: Newspaper,
  sofa: Sofa,
  smartphone: Smartphone,
  truck: Truck,
  laptop: Laptop,
  "map-pin": MapPin,
  users: Users,
  battery: Battery,
  "triangle-alert": TriangleAlert,
  "x-circle": XCircle,
  "circle-help": CircleHelp,
}

/**
 * 収集区分バッジ。色+テキスト+アイコンの3点で識別する(色だけに依存しない)。
 * 色・アイコンは自治体の指定 → 区分の kind の既定値 の順で決まる。色は淡く(透過をかけて)使う。
 */
export function CategoryBadge({
  category,
  size = "sm",
}: {
  category: Category
  size?: "sm" | "md"
}) {
  const { lang } = useLang()
  const { color, icon } = resolveCategoryStyle(category)
  const Icon =
    ICONS[icon] ??
    ICONS[resolveCategoryStyle({ kind: category.kind }).icon] ??
    Trash2
  const sizeClass =
    size === "md" ? "text-sm px-3 py-1.5 gap-1.5" : "text-xs px-2 py-1 gap-1"
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClass}`}
      style={{
        backgroundColor: `${color}1a`,
        border: `1px solid ${color}59`,
        color: "var(--foreground)",
      }}
    >
      <Icon
        aria-hidden
        style={{ color }}
        className={size === "md" ? "size-4" : "size-3.5"}
      />
      {lang === "en" ? category.name_en : category.name_ja}
    </span>
  )
}
