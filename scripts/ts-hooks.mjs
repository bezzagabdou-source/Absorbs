/**
 * محمّل TypeScript لسكربتات الفحص (بلا أي تبعية إضافية).
 * يستعمل typescript المثبَّت في المشروع لتحويل .ts/.tsx إلى ESM عند الاستيراد،
 * ويفهم اختصار المسار @/ كما في tsconfig، والاستيرادات النسبية بلا امتداد.
 *
 * يُستعمل عبر: node --import ./scripts/ts-register.mjs <script>
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = new URL('../', import.meta.url);

/** يجرّب إضافة الامتدادات المحتملة كما يفعل Next.js */
function withExtension(base) {
  if (existsSync(`${base}.ts`)) return `${base}.ts`;
  if (existsSync(`${base}.tsx`)) return `${base}.tsx`;
  if (existsSync(`${base}.mjs`)) return `${base}.mjs`;
  if (existsSync(`${base}.js`)) return `${base}.js`;
  if (existsSync(`${base}/index.ts`)) return `${base}/index.ts`;
  if (existsSync(`${base}/index.tsx`)) return `${base}/index.tsx`;
  return base;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const mapped = fileURLToPath(new URL(`src/${specifier.slice(2)}`, ROOT));
    return nextResolve(withExtension(mapped), context);
  }
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  if (isRelative) {
    const last = specifier.split('/').pop() ?? '';
    const hasExtension = last.includes('.');
    if (!hasExtension) {
      const parent = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : process.cwd();
      return nextResolve(withExtension(resolvePath(parent, specifier)), context);
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith('.ts') && !url.endsWith('.tsx')) return nextLoad(url, context);
  const source = await readFile(fileURLToPath(url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      isolatedModules: true,
    },
    fileName: fileURLToPath(url),
  });
  return { format: 'module', source: output.outputText, shortCircuit: true };
}
