import type { Metadata, Viewport } from 'next';
import './apex.css';
import { ApexShell } from '@/components/apex/ApexShell';

export const metadata: Metadata = {
  title: 'ABSORBS APEX · استوديو توليد الألعاب والمواقع',
  description:
    'استوديو ذكاء اصطناعي عربي: اطلب لعبة أو موقعاً، ولّد الكود، افحصه ببوابة صارمة، ثم سلّمه برمز تحقق — واجهة v19 APEX.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'ABSORBS APEX — استوديو التوليد الأسطوري',
    description: 'توليد الألعاب والمواقع مع فحص إلزامي قبل التسليم وتسليم برمز تحقق.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#05070f',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * مسار /apex — تجربة v19 APEX الكاملة.
 * صفحة سيرفر خفيفة تُسلّم الواجهة التفاعلية (عميل) لتفادي أي عدم تطابق في الترطيب.
 */
export default function ApexPage() {
  return (
    <>
      <link rel="preload" href="/icon.svg" as="image" type="image/svg+xml" />
      <ApexShell />
    </>
  );
}
