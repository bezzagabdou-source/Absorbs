export type UserRow = {
  tg_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_admin: boolean;
  is_owner: boolean;
  is_blocked: boolean;
  avatar_file_id: string | null;
  orders_count: number;
  total_spent: string;
  state: string | null;
  state_data: Record<string, unknown> | null;
  notes: string | null;
  ban_reason: string | null;
  joined_from: string | null;
  points: number;
  referrals_count: number;
  inviter_id?: string | null;
  inviter_name?: string | null;
  inviter_username?: string | null;
  created_at: string;
  last_seen_at: string;
};

export type CategoryRow = {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  section: string;
  description: string;
  image_url: string | null;
  sort: number;
  active: boolean;
  products_count?: number;
};

export type ProductRow = {
  id: number;
  category_id: number | null;
  category_name?: string | null;
  name: string;
  description: string;
  price: string | null;
  price_label: string | null;
  image_url: string | null;
  image_file_id: string | null;
  active: boolean;
  featured: boolean;
  sort: number;
  fields: ProductField[];
  stock: number | null;
  badge: string | null;
  sold: number;
  created_at: string;
  updated_at: string;
};

export type ProductField = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
};

export type OrderRow = {
  id: number;
  code: string;
  user_id: string;
  kind: "product" | "usd";
  product_id: number | null;
  product_name: string;
  quantity: number;
  amount: string;
  currency: string;
  rate: string | null;
  usd_amount: string | null;
  status: OrderStatus;
  payment_method: string | null;
  receipt_file_id: string | null;
  receipt_kind: string | null;
  details: Record<string, string> | null;
  note: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  username?: string | null;
  first_name?: string | null;
};

export type OrderStatus =
  | "pending_payment"
  | "awaiting_review"
  | "approved"
  | "rejected"
  | "delivered"
  | "cancelled";

export type WalletRow = {
  id: number;
  name: string;
  emoji: string;
  kind: string;
  account: string;
  holder: string;
  instructions: string;
  active: boolean;
  sort: number;
};

export type ChannelRow = {
  id: number;
  chat: string;
  title: string;
  url: string;
  active: boolean;
  sort: number;
};

export type SettingsMap = Record<string, unknown>;

export type Stats = {
  users: number;
  users_today: number;
  active_24h: number;
  blocked: number;
  orders: number;
  orders_today: number;
  pending: number;
  revenue: string;
  revenue_today: string;
  revenue_month: string;
  usd_volume: string;
  products: number;
  conversion: number;
  series: { day: string; orders: number; revenue: number; users: number }[];
};

export type LogRow = {
  id: number;
  level: string;
  action: string;
  actor: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};
