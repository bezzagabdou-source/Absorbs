import { sql } from "drizzle-orm";
import { withActor } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
export type DashboardData = {
  summary: { views: number; offers: number; activeListings: number; sales: number; revenue: number; profit: number | null; uncostedSales: number };
  series: { date: string; views: number; offers: number; sales: number; revenue: number }[];
  topProducts: { id: string; title: string; offers: number; views: number }[];
  transactions: { id: string; title: string; amount: number; releasedAt: string; provider: string }[];
};
export async function getDashboard(actor: SessionUser, days: 7 | 30 | 90): Promise<DashboardData> {
  return withActor(actor, async (tx) => {
    const since = new Date(Date.now() - days * 86400000); const seller = actor.id;
    const summary = await tx.execute(sql`select
      coalesce((select sum(v.count)::int from product_views v join products p on p.id=v.product_id where p.seller_id=${seller} and v.day>=${since}),0) as views,
      (select count(*)::int from offers where seller_id=${seller} and created_at>=${since}) as offers,
      (select count(*)::int from products where seller_id=${seller} and status='active') as "activeListings",
      (select count(*)::int from escrow_transactions where seller_id=${seller} and status='released' and released_at>=${since}) as sales,
      coalesce((select sum(amount_dzd) from escrow_transactions where seller_id=${seller} and status='released' and released_at>=${since}),0) as revenue,
      (select sum(e.amount_dzd-p.cost_dzd) from escrow_transactions e join products p on p.id=e.product_id where e.seller_id=${seller} and e.status='released' and e.released_at>=${since} and p.cost_dzd is not null) as profit,
      (select count(*)::int from escrow_transactions e join products p on p.id=e.product_id where e.seller_id=${seller} and e.status='released' and e.released_at>=${since} and p.cost_dzd is null) as "uncostedSales"`);
    const series = await tx.execute(sql`with days as (select generate_series(date_trunc('day',(${since}::timestamptz) at time zone 'Africa/Algiers'),date_trunc('day',now() at time zone 'Africa/Algiers'),interval '1 day') as day),
      v as (select date_trunc('day',v.day at time zone 'Africa/Algiers') as day,sum(v.count) n from product_views v join products p on p.id=v.product_id where p.seller_id=${seller} and v.day>=${since} group by 1),
      o as (select date_trunc('day',created_at at time zone 'Africa/Algiers') as day,count(*) n from offers where seller_id=${seller} and created_at>=${since} group by 1),
      s as (select date_trunc('day',released_at at time zone 'Africa/Algiers') as day,count(*) n,sum(amount_dzd) revenue from escrow_transactions where seller_id=${seller} and status='released' and released_at>=${since} group by 1)
      select to_char(d.day,'YYYY-MM-DD') date,coalesce(v.n,0)::int views,coalesce(o.n,0)::int offers,coalesce(s.n,0)::int sales,coalesce(s.revenue,0)::float revenue from days d left join v using(day) left join o using(day) left join s using(day) order by d.day`);
    const top = await tx.execute(sql`select p.id,p.title,p.view_count::int views,count(o.id)::int offers from products p left join offers o on o.product_id=p.id and o.created_at>=${since} where p.seller_id=${seller} group by p.id order by count(o.id) desc,p.view_count desc limit 5`);
    const transactions = await tx.execute(sql`select e.id,p.title,e.amount_dzd::float amount,e.released_at as "releasedAt",e.payment_provider provider from escrow_transactions e join products p on p.id=e.product_id where e.seller_id=${seller} and e.status='released' and e.released_at>=${since} order by e.released_at desc limit 100`);
    const row = summary.rows[0] as Record<string, number | string | null>;
    return { summary: { views: Number(row.views), offers: Number(row.offers), activeListings: Number(row.activeListings), sales: Number(row.sales), revenue: Number(row.revenue), profit: row.profit === null ? null : Number(row.profit), uncostedSales: Number(row.uncostedSales) }, series: series.rows as DashboardData["series"], topProducts: top.rows as DashboardData["topProducts"], transactions: transactions.rows as DashboardData["transactions"] };
  });
}
