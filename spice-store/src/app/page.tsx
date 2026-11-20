import type { Metadata } from "next";
import { getStoreData } from "@/lib/server/store";
import Storefront from "@/components/Storefront";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getStoreData();
  return { title: `${settings.storeName} | نكهة الأصالة من خيرات الطبيعة` };
}

export default async function HomePage() {
  const data = await getStoreData();
  return <Storefront initialData={data} />;
}
