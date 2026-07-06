import {
  Battery,
  Laptop,
  MapPin,
  Package,
  Recycle,
  Shirt,
  Smartphone,
  Sofa,
  Trash2,
  Truck,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import type { Category } from "@/lib/schemas"

// categories.json の icon 名 → lucide コンポーネント
const ICONS: Record<string, LucideIcon> = {
  trash: Trash2,
  recycle: Recycle,
  package: Package,
  shirt: Shirt,
  sofa: Sofa,
  smartphone: Smartphone,
  truck: Truck,
  laptop: Laptop,
  "map-pin": MapPin,
  users: Users,
  battery: Battery,
  "x-circle": XCircle,
}

/**
 * 収集区分バッジ。色+テキスト+アイコンの3点で識別する(色だけに依存しない)。
 * 色は categories.json の値を淡く(背景に透過をかけて)使う。
 */
export function CategoryBadge({
  category,
  size = "sm",
}: {
  category: Category
  size?: "sm" | "md"
}) {
  const Icon = ICONS[category.icon] ?? Trash2
  const sizeClass =
    size === "md" ? "text-sm px-3 py-1.5 gap-1.5" : "text-xs px-2 py-1 gap-1"
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClass}`}
      style={{
        backgroundColor: `${category.color}1a`,
        border: `1px solid ${category.color}59`,
        color: "var(--foreground)",
      }}
    >
      <Icon
        aria-hidden
        style={{ color: category.color }}
        className={size === "md" ? "size-4" : "size-3.5"}
      />
      {category.name_ja}
    </span>
  )
}
