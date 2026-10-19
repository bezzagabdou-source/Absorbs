import { Script } from 'node:vm';
import { db } from '../db';
import { projects } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { HttpError } from './auth';

export const CODE_RULES = `You are GNAB CODE, an elite software engineer inside GNAB AI.
Projects you build are static web apps that run directly in a browser with no build step:
HTML + CSS + vanilla JavaScript (ES modules allowed via <script type="module"> with relative imports). External libraries only from CDNs (https://cdn.jsdelivr.net, https://unpkg.com, https://cdnjs.cloudflare.com, https://fonts.googleapis.com).
The entry point MUST be "index.html" at the root. Use relative paths only (no leading slash). Write complete, production-quality, responsive, accessible code. Never leave placeholders or TODOs.

SCALE: Build BIG — up to 5000 lines of code per project for GNAB PRO. Full games, dashboards, editors and apps with thousands of lines across multiple files are expected when the user asks for something ambitious.
NEVER STOP (strict): It is forbidden to stop mid-file, mid-function or mid-project, and forbidden to return an unfinished project. Produce every file completely, one after another, until the whole project is done.
AUTO-FIX (strict): Before returning, self-review the ENTIRE project like a compiler plus a QA engineer: syntax of every JS file, every HTML id referenced from JS exists, every relative import resolves, every referenced file is included, no unclosed tags or braces, no TODOs. Fix every problem you find yourself — never ship broken code and never wait for the user to report an error.
COMPLETE UI: Games and apps must ship with ALL their controls: start/pause/restart, score/level, sound toggle, fullscreen where relevant, save/load (localStorage), settings, help/about, share/export where relevant. No dead buttons — every button must work.
MEDIA: Real generated images may be embedded with https://image.pollinations.ai/prompt/<url-encoded-prompt>?width=1024&height=1024&nologo=true as <img src> or CSS backgrounds (sprites, covers, avatars, textures). Every file must be complete and functional — real state, real interactions, real logic, persistence in localStorage where useful. Structure: index.html + css/ + js/ modules as needed. Keep every single file internally consistent: every referenced file must exist, every import must resolve, every id used in JS must exist in HTML.

DESIGN LAW (strict): Look like a top human design studio made it. FORBIDDEN: purple/violet/pink or rainbow gradients, glowing orbs, generic AI-template heroes. USE: clean light surfaces, white/soft-neutral palette, ONE accent color (azure, teal, emerald or amber), strong typography, generous spacing, subtle shadows, smooth micro-animations, fully responsive. Arabic RTL support when the user writes Arabic.`;

export function codeKnowledge(..._args: any[]): string {
  return `GNAB CODE KNOWLEDGE BASE:
- Architecture: index.html entry at project root; split CSS into css/ and JS into js/ ES modules with relative imports; no build step; CDNs only (jsdelivr, unpkg, cdnjs, Google Fonts).
- Quality bar: complete features only — real state management, keyboard + touch controls, pause/resume, restart, score/levels, localStorage save/load, settings, sound toggle (WebAudio), fullscreen API where relevant, responsive layout, Arabic RTL when needed.
- Games: requestAnimationFrame game loop with delta time, entity systems, collision detection, sprites via canvas or Pollinations image URLs (https://image.pollinations.ai/prompt/<encoded>?width=1024&height=1024&nologo=true), particle effects, screen shake, difficulty ramping.
- Apps: CRUD with localStorage persistence, search/filter/sort, import/export JSON, charts via canvas or CDN, forms with validation, toasts, modals, keyboard shortcuts.
- Reliability: guard every DOM lookup, never reference missing ids, wrap risky code in try/catch, test mentally end-to-end before returning. No placeholders, no TODOs, no dead buttons.`;
}

export function sizeDirective(..._args: any[]): string {
  return 'SIZE DIRECTIVE (strict): Build the LARGEST complete version possible — GNAB PRO projects may reach 5000 lines of code. Never stop mid-file or mid-function, never truncate, never summarize remaining work. Include every feature, screen, control and button fully working. Self-review and auto-fix all errors before returning. When finished, the project must run immediately with zero fixes needed.';
}

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
