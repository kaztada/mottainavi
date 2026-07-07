import { HomeShell } from "@/components/HomeShell"
import { getCategories, getMunicipality } from "@/lib/data"

export default function Home() {
  return (
    <HomeShell categories={getCategories()} municipality={getMunicipality()} />
  )
}
