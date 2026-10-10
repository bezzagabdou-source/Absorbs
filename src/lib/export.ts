/**
 * Conversation export: Markdown file and PDF (print-to-PDF, no dependencies,
 * so Arabic / RTL text renders correctly).
 */

export type ExportMessage = { role: string; content: string };
export type ExportOptions = { title?: string; assistantName?: string; userName?: string };

const stamp = () => new Date().toISOString().slice(0, 10);

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function visible(msgs: ExportMessage[]) {
  return msgs.filter((m) => m.content && m.content.trim());
}

/* ---------- Markdown ---------- */

export function toMarkdown(msgs: ExportMessage[], o: ExportOptions = {}): string {
  const title = o.title ?? "Nexus AI v8.4";
  const ai = o.assistantName ?? "⚡ Nexus AI v8.4";
  const me = o.userName ?? "👤";
  const body = visible(msgs)
    .map((m) => `### ${m.role === "user" ? me : ai}\n\n${m.content.trim()}`)
    .join("\n\n---\n\n");
  return `# ${title}\n\n_${stamp()}_\n\n${body}\n`;
}

export function downloadMarkdown(msgs: ExportMessage[], o: ExportOptions = {}): void {
  save(
    new Blob([toMarkdown(msgs, o)], { type: "text/markdown;charset=utf-8" }),
    `barq-chat-${stamp()}.md`
  );
}

/* ---------- tiny markdown → HTML (for the PDF) ---------- */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l: string) =>
    l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = /^```(\w+)?/.exec(line);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      const lang = fence[1] ? `<span class="lang">${esc(fence[1])}</span>` : "";
      out.push(`<pre>${lang}<code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    // table
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`
      );
      continue;
    }
    // heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_]){3,}\s*$/.test(line)) {
      out.push("<hr/>");
      i++;
      continue;
    }
    // quote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
      continue;
    }
    // lists
    const li = /^\s*([-*+]|\d+\.)\s+/.exec(line);
    if (li) {
      const ordered = /\d/.test(li[1]);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ""));
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${tag}>`);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    // paragraph
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(```|#{1,4}\s|>\s?|\s*([-*+]|\d+\.)\s+)/.test(lines[i])
    ) {
      buf.push(lines[i++]);
    }
    out.push(`<p>${inline(buf.join("\n")).replace(/\n/g, "<br/>")}</p>`);
  }
  return out.join("\n");
}

/* ---------- PDF ---------- */

const PRINT_CSS = `
@page{size:A4;margin:16mm 14mm}
*{box-sizing:border-box}
body{margin:0;font:13px/1.75 "Segoe UI",Tahoma,"Noto Naskh Arabic","Noto Sans Arabic",Arial,sans-serif;color:#0f172a}
h1.title{font-size:22px;margin:0 0 2px}
.date{color:#64748b;font-size:11px;margin-bottom:18px}
.msg{break-inside:avoid-page;margin:0 0 14px;padding:12px 14px;border-radius:10px;border:1px solid #e2e8f0}
.msg.user{background:#eff6ff;border-color:#bfdbfe}
.msg.ai{background:#fff}
.who{font-weight:700;font-size:11px;color:#1d4ed8;margin-bottom:6px}
.msg.ai .who{color:#b45309}
p{margin:.45em 0}h2,h3,h4,h5{margin:.9em 0 .3em}
code{font-family:ui-monospace,Consolas,monospace;background:#f1f5f9;padding:1px 4px;border-radius:4px;direction:ltr;unicode-bidi:embed}
pre{direction:ltr;text-align:left;background:#0f172a;color:#e2e8f0;padding:10px 12px;border-radius:8px;white-space:pre-wrap;word-break:break-word;font-size:11px;position:relative;break-inside:avoid}
pre code{background:none;padding:0;color:inherit}
.lang{display:block;color:#7dd3fc;font-size:10px;margin-bottom:4px}
table{border-collapse:collapse;width:100%;margin:.6em 0;font-size:12px}
th,td{border:1px solid #cbd5e1;padding:4px 8px;text-align:start}th{background:#e2e8f0}
blockquote{margin:.6em 0;padding:.2em .9em;border-inline-start:3px solid #f59e0b;color:#475569}
a{color:#1d4ed8}ul,ol{padding-inline-start:1.4em}
`;

export function buildPrintHtml(msgs: ExportMessage[], o: ExportOptions = {}): string {
  const title = esc(o.title ?? "Nexus AI v8.4");
  const ai = esc(o.assistantName ?? "⚡ Nexus AI v8.4");
  const me = esc(o.userName ?? "👤");
  const body = visible(msgs)
    .map((m) => {
      const user = m.role === "user";
      return `<section class="msg ${user ? "user" : "ai"}" dir="auto"><div class="who">${
        user ? me : ai
      }</div>${markdownToHtml(m.content)}</section>`;
    })
    .join("\n");
  return `<!doctype html><html dir="auto"><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_CSS}</style></head><body><h1 class="title">${title}</h1><div class="date">${stamp()}</div>${body}</body></html>`;
}

/**
 * Opens the system print dialog with the chat laid out for A4: choose "Save as PDF".
 * Falls back to downloading a standalone .html if printing is blocked.
 */
export function exportPdf(msgs: ExportMessage[], o: ExportOptions = {}): void {
  const html = buildPrintHtml(msgs, o);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0;visibility:hidden";
  document.body.appendChild(frame);
  const cleanup = () => setTimeout(() => frame.remove(), 1500);
  try {
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!win || !doc) throw new Error("no frame");
    doc.open();
    doc.write(html);
    doc.close();
    win.addEventListener("afterprint", cleanup);
    // give fonts / layout a beat before the dialog opens
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        save(new Blob([html], { type: "text/html;charset=utf-8" }), `barq-chat-${stamp()}.html`);
        cleanup();
      }
    }, 350);
    setTimeout(cleanup, 120_000);
  } catch {
    save(new Blob([html], { type: "text/html;charset=utf-8" }), `barq-chat-${stamp()}.html`);
    cleanup();
  }
}
