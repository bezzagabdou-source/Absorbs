import { Script } from 'node:vm';
import { db } from '../db';
import { projects } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { HttpError } from './auth';

export const CODE_RULES = `You are GNAB CODE, an elite software engineer inside GNAB AI.
Projects you build are static web apps that run directly in a browser with no build step:
HTML + CSS + vanilla JavaScript (ES modules allowed via <script type="module"> with relative imports). External libraries only from CDNs (https://cdn.jsdelivr.net, https://unpkg.com, https://cdnjs.cloudflare.com, https://fonts.googleapis.com).
The entry point MUST be "index.html" at the root. Use relative paths only (no leading slash). Write complete, production-quality, responsive, accessible code. Never leave placeholders or TODOs.

SCALE: Build BIG. Full games, dashboards, editors and apps with thousands of lines across multiple files are expected when the user asks for something ambitious. Every file must be complete and functional — real state, real interactions, real logic, persistence in localStorage where useful. Structure: index.html + css/ + js/ modules as needed. Keep every single file internally consistent: every referenced file must exist, every import must resolve, every id used in JS must exist in HTML.

DESIGN LAW (strict): Look like a top human design studio made it. FORBIDDEN: purple/violet/pink or rainbow gradients, glowing orbs, generic AI-template heroes. USE: clean light surfaces, white/soft-neutral palette, ONE accent color (azure, teal, emerald or amber), strong typography, generous spacing, subtle shadows, smooth micro-animations, fully responsive. Arabic RTL support when the user writes Arabic.`;

export const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  webmanifest: 'application/manifest+json',
};

export function extractJson<T = any>(text: string): T {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON');
  return JSON.parse(m[0]);
}

export async function ownProject(userId: string, projectId: string) {
  const [p] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  if (!p) throw new HttpError(404, 'Project not found');
  return p;
}

export interface FileIssue {
  path: string;
  problem: string;
}

export function reviewFiles(files: { path: string; content: string }[]): FileIssue[] {
  const issues: FileIssue[] = [];
  const paths = new Set(files.map((f) => f.path));
  if (!paths.has('index.html')) issues.push({ path: 'index.html', problem: 'Missing entry file index.html' });
  for (const f of files) {
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : '';
    if (/\.html$/.test(f.path)) {
      for (const m of f.content.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)) {
        const ref = m[1];
        if (/^(https?:|data:|mailto:|tel:|javascript:|\/\/)/.test(ref) || ref === '' || ref.endsWith('/')) continue;
        const resolved = new URL(ref, 'http://x/' + dir).pathname.slice(1);
        if (/\.(css|js|mjs|html)$/.test(resolved) && !paths.has(resolved)) {
          issues.push({ path: f.path, problem: `References missing file "${ref}"` });
        }
      }
    }
    if (/\.(js|mjs)$/.test(f.path)) {
      if (/^\s*(import|export)\s/m.test(f.content)) {
        for (const m of f.content.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
          const resolved = new URL(m[1], 'http://x/' + dir).pathname.slice(1);
          if (!paths.has(resolved)) issues.push({ path: f.path, problem: `Imports missing module "${m[1]}"` });
        }
      } else {
        try {
          new Script(f.content, { filename: f.path });
        } catch (e: any) {
          issues.push({ path: f.path, problem: `JavaScript syntax error: ${e.message}` });
        }
      }
    }
  }
  return issues;
}

export function safePath(p: string): string | null {
  const b = p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  if (!b || b.split('/').some((s) => s === '..' || s === '.') || !/^[\w\-./]+$/.test(b) || b.length > 160) return null;
  return b;
}

export function stripFences(text: string): string {
  const m = text.match(/^\s*```[\w-]*\n([\s\S]*?)\n```\s*$/);
  return m ? m[1] : text.replace(/^\s*```[\w-]*\n/, '').replace(/\n```\s*$/, '');
}
