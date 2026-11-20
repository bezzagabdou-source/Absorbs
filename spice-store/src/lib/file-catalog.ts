import { z } from 'zod';
import file from '@/data/catalog.json';
const id = z.number().int().positive();
const image = z.string().max(1000).regex(/^(?:\/images\/|https:\/\/)/);
export const catalogSchema = z.object({
  settings:z.object({storeName:z.string().trim().min(1).max(100),whatsapp:z.string().regex(/^[+\d\s()-]{7,30}$/),currency:z.string().min(1).max(12),deliveryMessage:z.string().min(1).max(150)}),
  categories:z.array(z.object({id,name:z.string().trim().min(1).max(120),image,sortOrder:z.number().int()})).min(1).max(500),
  products:z.array(z.object({id,categoryId:id,name:z.string().trim().min(1).max(200),image,status:z.enum(['available','limited','unavailable']),price:z.string().regex(/^\d{1,8}(\.\d{1,2})?$/),sortOrder:z.number().int()})).max(5000)
}).refine(data => {
  const ids=new Set(data.categories.map(c=>c.id));
  return ids.size===data.categories.length && new Set(data.products.map(p=>p.id)).size===data.products.length && data.products.every(p=>ids.has(p.categoryId));
});
export const bundledCatalog = catalogSchema.parse(file);
