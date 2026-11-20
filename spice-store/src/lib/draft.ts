import { catalogSchema } from './file-catalog';
import type { StoreData } from './types';
export const draftKey='asil-catalog-draft-v1';
const nextId=(items:{id:number}[])=>1+Math.max(0,...items.map(x=>x.id));
export function editDraft(data:StoreData, body:Record<string, unknown>):StoreData {
  const next=structuredClone(data);
  switch(body.action){
    case 'saveSettings': return catalogSchema.parse({...next, settings:body.settings});
    case 'addCategory': next.categories.push({id:nextId(next.categories), name:String(body.name||''), image:String(body.image||'/images/herbs.png'), sortOrder:100});break;
    case 'deleteProduct': next.products=next.products.filter(p=>p.id!==body.id);break;
    case 'saveProduct': {
      const p=body.product as Partial<StoreData['products'][number]>;
      const category=next.categories.find(c=>c.id===Number(p.categoryId));
      if(!category) throw Error('Category missing');
      const row={...p,id:p.id||nextId(next.products),categoryId:category.id,price:Number(p.price).toFixed(2),image:p.image||category.image,sortOrder:p.sortOrder??100};
      const products=next.products.some(x=>x.id===row.id)?next.products.map(x=>x.id===row.id?row:x):[...next.products,row];
      return catalogSchema.parse({...next,products});
    }
    default: throw Error('Unknown edit');
  }
  return catalogSchema.parse(next);
}
