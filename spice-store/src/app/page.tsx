import Storefront from "@/components/Storefront";
import { initialCategories, initialProduct } from "@/lib/catalog";
import type { StoreData } from "@/lib/types";

// Always serve a browsable HTML catalog, including on a cold start or DB outage.
// Reference IDs are negative so they can never match a saved live cart item.
export default function HomePage() {
  let id = 0;
  const data: StoreData = {
    settings: { storeName: "توابل الأصيل", currency: "دج", whatsapp: "0799902001", deliveryMessage: "تواصل معنا لتأكيد التوفر" },
    categories: initialCategories.map(({ name, image }, i) => ({ id: -i - 1, name, image, sortOrder: i })),
    products: initialCategories.flatMap(({ items, image }, i) => items.map(name => ({
      ...initialProduct(name, i, image), categoryId: -i - 1, id: --id,
    }))).sort((a, b) => a.sortOrder - b.sortOrder),
  };
  return <Storefront initialData={data} />;
}
