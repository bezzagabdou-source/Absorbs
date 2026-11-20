import Storefront from '@/components/Storefront';
import { bundledCatalog } from '@/lib/file-catalog';
export default function Page() { return <Storefront initialData={bundledCatalog}/>; }
