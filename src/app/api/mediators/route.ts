import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const FILE = path.join(process.cwd(), "mediators-bot", "data.json");

async function load() {
  return JSON.parse(await readFile(FILE, "utf-8"));
}
async function save(d: any) {
  await writeFile(FILE, JSON.stringify(d, null, 2), "utf-8");
}

export async function GET() {
  return NextResponse.json(await load());
}

export async function POST(req: Request) {
  const b = await req.json();
  const d = await load();
  if (b.action === "add" && d.sections[b.section]) {
    d.sections[b.section].push({ name: b.name || "", username: b.username || "", guarantee: b.guarantee || "", note: b.note || "" });
  } else if (b.action === "del" && d.sections[b.section]) {
    d.sections[b.section].splice(b.index, 1);
  }
  await save(d);
  return NextResponse.json({ ok: true });
}
