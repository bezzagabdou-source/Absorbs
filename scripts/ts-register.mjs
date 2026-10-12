/** يفعّل محمّل TypeScript قبل تشغيل أي استيراد (يُستعمل مع node --import). */
import { register } from 'node:module';
register('./ts-hooks.mjs', import.meta.url);
