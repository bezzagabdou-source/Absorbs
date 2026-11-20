export type Availability = "available" | "unavailable" | "limited";

export type Category = {
  id: number;
  name: string;
  image: string;
  sortOrder: number;
};

export type Product = {
  id: number;
  name: string;
  categoryId: number;
  price: string;
  status: Availability;
  image: string;
  sortOrder: number;
};

export type PublicSettings = {
  storeName: string;
  whatsapp: string;
  deliveryMessage: string;
  currency: string;
};

export type StoreData = {
  categories: Category[];
  products: Product[];
  settings: PublicSettings;
};

export type AdminData = StoreData & {
  stats: { totalVisits: number; todayVisits: number };
};
