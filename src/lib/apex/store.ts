/**
 * NEXUS APEX — project store.
 *
 * Saves generated projects so they get a **real live URL** (`/p/<slug>`) and can be
 * re-opened, re-downloaded or re-published later. Postgres is the primary store
 * (schema `barq.apex_projects`); when no database is configured — local dev, a
 * sandbox, a preview without env vars — an in-process LRU keeps the flow working
 * instead of failing the request.
 */

import { db } from "@/db";
import { apexProjects } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export interface ApexStoredProject {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  blueprint: string;
  kind: string;
  palette: string;
  lang: string;
  scale: string;
  plan: Record<string, unknown>;
  manifest: { path: string; lines: number; bytes: number; lang: string }[];
  html: string;
  modules: number;
  lines: number;
  files: number;
  bytes: number;
  score: number;
  dataRows: number;
  buildMs: number;
  visibility: "private" | "unlisted" | "public";
  views: number;
  createdAt: string;
  updatedAt: string;
}

export type ApexProjectMeta = Omit<ApexStoredProject, "html" | "manifest" | "plan">;

/* --------------------------------------------------------------- fallback */

const MEMORY = new Map<string, ApexStoredProject>();
const MEMORY_MAX = 24;

function memorySet(p: ApexStoredProject) {
  if (MEMORY.size >= MEMORY_MAX) {
    const oldest = [...MEMORY.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1))[0];
    if (oldest) MEMORY.delete(oldest.slug);
  }
  MEMORY.set(p.slug, p);
}

export function memoryGet(slug: string): ApexStoredProject | null {
  return MEMORY.get(slug) ?? null;
}

export function memoryList(): ApexProjectMeta[] {
  return [...MEMORY.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).map(metaOf);
}

/* ------------------------------------------------------------------ utils */

/**
 * URL-safe slug: Latin letters/digits only (Arabic words would percent-encode
 * into unreadable links and break some chat clients). Arabic titles fall back to
 * the project kind, so a shop is `/p/ecommerce-a7k2m`.
 */
function slugify(input: string, fallback = "nexus-project"): string {
  const ascii = (input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (ascii.replace(/-/g, "").length >= 3) return ascii;
  return fallback;
}

/** Short, unguessable, URL-safe suffix (no dashes so it reads as one word). */
export function shortId(len = 6): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function metaOf(row: ApexStoredProject): ApexProjectMeta {
  const { html: _html, manifest: _m, plan: _p, ...meta } = row;
  void _html; void _m; void _p;
  return meta;
}

function normalizeRow(row: Record<string, unknown>): ApexStoredProject {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title ?? ""),
    tagline: String(row.tagline ?? ""),
    blueprint: String(row.blueprint ?? ""),
    kind: String(row.kind ?? "app"),
    palette: String(row.palette ?? "midnight"),
    lang: String(row.lang ?? "ar"),
    scale: String(row.scale ?? "large"),
    plan: (row.plan as Record<string, unknown>) ?? {},
    manifest: (row.manifest as ApexStoredProject["manifest"]) ?? [],
    html: String(row.html ?? ""),
    modules: Number(row.modules ?? 0),
    lines: Number(row.lines ?? 0),
    files: Number(row.files ?? 0),
    bytes: Number(row.bytes ?? 0),
    score: Number(row.score ?? 0),
    dataRows: Number(row.dataRows ?? 0),
    buildMs: Number(row.buildMs ?? 0),
    visibility: (row.visibility as ApexStoredProject["visibility"]) ?? "private",
    views: Number(row.views ?? 0),
    createdAt: new Date(String(row.createdAt ?? Date.now())).toISOString(),
    updatedAt: new Date(String(row.updatedAt ?? Date.now())).toISOString(),
  };
}

async function uniqueSlug(base: string, fallback = "nexus-project"): Promise<string> {
  const root = slugify(base, fallback);
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = `${root}-${shortId(attempt === 0 ? 5 : 7)}`;
    try {
      const rows = await db
        .select({ id: apexProjects.id })
        .from(apexProjects)
        .where(eq(apexProjects.slug, candidate))
        .limit(1);
      if (!rows.length) return candidate;
    } catch {
      return candidate; /* no database → the slug is free in memory too */
    }
  }
  return `${root}-${shortId(9)}`;
}

export interface SaveApexInput {
  uid: string;
  title: string;
  tagline: string;
  blueprint: string;
  kind: string;
  palette: string;
  lang: string;
  scale: string;
  plan: Record<string, unknown>;
  manifest: { path: string; lines: number; bytes: number; lang: string }[];
  html: string;
  modules: number;
  lines: number;
  files: number;
  bytes: number;
  score: number;
  dataRows: number;
  buildMs: number;
  visibility?: ApexStoredProject["visibility"];
}

export async function saveApexProject(input: SaveApexInput): Promise<ApexStoredProject> {
  const slug = await uniqueSlug(input.title, slugify(input.blueprint || input.kind || "nexus-app"));
  const now = new Date().toISOString();
  const row: ApexStoredProject = {
    id: slug,
    slug,
    title: input.title,
    tagline: input.tagline,
    blueprint: input.blueprint,
    kind: input.kind,
    palette: input.palette,
    lang: input.lang,
    scale: input.scale,
    plan: input.plan,
    manifest: input.manifest,
    html: input.html,
    modules: input.modules,
    lines: input.lines,
    files: input.files,
    bytes: input.bytes,
    score: input.score,
    dataRows: input.dataRows,
    buildMs: input.buildMs,
    visibility: input.visibility ?? "private",
    views: 0,
    createdAt: now,
    updatedAt: now,
  };
  /* guests have no row to reference: keep the project in memory so the live URL
     still works in this instance while nothing is written to the database */
  if (input.uid === "guest") {
    memorySet(row);
    return row;
  }
  try {
    const inserted = await db
      .insert(apexProjects)
      .values({
        userId: input.uid,
        slug,
        title: input.title,
        tagline: input.tagline,
        blueprint: input.blueprint,
        kind: input.kind,
        palette: input.palette,
        lang: input.lang,
        scale: input.scale,
        plan: input.plan,
        manifest: input.manifest,
        html: input.html,
        modules: input.modules,
        lines: input.lines,
        files: input.files,
        bytes: input.bytes,
        score: input.score,
        dataRows: input.dataRows,
        buildMs: input.buildMs,
        visibility: row.visibility,
      })
      .returning();
    if (inserted[0]) return normalizeRow(inserted[0] as unknown as Record<string, unknown>);
  } catch (e) {
    console.warn("[apex] db save failed, keeping it in memory:", e instanceof Error ? e.message : e);
  }
  memorySet(row);
  return row;
}

export async function listApexProjects(uid: string, limit = 60): Promise<ApexProjectMeta[]> {
  try {
    const rows = await db
      .select()
      .from(apexProjects)
      .where(eq(apexProjects.userId, uid))
      .orderBy(desc(apexProjects.updatedAt))
      .limit(limit);
    if (rows.length) return rows.map((r) => metaOf(normalizeRow(r as unknown as Record<string, unknown>)));
    if (MEMORY.size) return memoryList();
    return [];
  } catch {
    return memoryList();
  }
}

export async function getApexProject(uid: string | null, idOrSlug: string): Promise<ApexStoredProject | null> {
  try {
    const bySlug = await db.select().from(apexProjects).where(eq(apexProjects.slug, idOrSlug)).limit(1);
    const row = bySlug[0];
    if (row) {
      const project = normalizeRow(row as unknown as Record<string, unknown>);
      if (uid && project.id && row.userId !== uid && project.visibility === "private") return null;
      return project;
    }
  } catch {
    /* fall through to memory */
  }
  return MEMORY.get(idOrSlug) ?? null;
}

export async function findPublicProject(slug: string): Promise<ApexStoredProject | null> {
  const mem = MEMORY.get(slug);
  try {
    const rows = await db.select().from(apexProjects).where(eq(apexProjects.slug, slug)).limit(1);
    const row = rows[0];
    if (row) {
      const project = normalizeRow(row as unknown as Record<string, unknown>);
      if (project.visibility === "private") return mem ?? null;
      void db
        .update(apexProjects)
        .set({ views: sql`${apexProjects.views} + 1` })
        .where(eq(apexProjects.slug, slug))
        .catch(() => undefined);
      return project;
    }
  } catch {
    /* memory only */
  }
  return mem ?? null;
}

export async function setApexVisibility(
  uid: string,
  slug: string,
  visibility: ApexStoredProject["visibility"]
): Promise<ApexStoredProject | null> {
  try {
    const updated = await db
      .update(apexProjects)
      .set({ visibility, updatedAt: new Date() })
      .where(and(eq(apexProjects.slug, slug), eq(apexProjects.userId, uid)))
      .returning();
    if (updated[0]) return normalizeRow(updated[0] as unknown as Record<string, unknown>);
  } catch {
    /* memory */
  }
  const mem = MEMORY.get(slug) ?? null;
  if (!mem) return null;
  mem.visibility = visibility;
  mem.updatedAt = new Date().toISOString();
  memorySet(mem);
  return mem;
}

export async function deleteApexProject(uid: string, slug: string): Promise<boolean> {
  MEMORY.delete(slug);
  try {
    const rows = await db
      .delete(apexProjects)
      .where(and(eq(apexProjects.slug, slug), eq(apexProjects.userId, uid)))
      .returning({ id: apexProjects.id });
    return rows.length > 0;
  } catch {
    return true;
  }
}

/** Public URL of a project (relative so it works on any host/domain). */
export function liveUrl(slug: string): string {
  return `/p/${slug}`;
}
