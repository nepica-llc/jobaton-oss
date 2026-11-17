// Export a resume or cover letter as a clean PDF (via the print dialog) or an editable Word file.
export type DocBlock =
  | { kind: "name"; text: string }
  | { kind: "contact"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "entry"; title: string; org?: string; right?: string }
  | { kind: "bullet"; text: string }
  | { kind: "para"; text: string }
  | { kind: "gap" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `@page{margin:0;size:letter}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:10.5pt;line-height:1.45;color:#1a1a1a}
table.page{width:100%;border-collapse:collapse}
table.page td{padding:0 0.7in}
.m{height:0.55in}
.name{text-align:center;font-size:18pt;font-weight:700;color:#0a2540;margin-bottom:2px}
.contact{text-align:center;font-size:9pt;color:#425466;padding-bottom:8px;margin-bottom:10px;border-bottom:2px solid #028FA2}
h2{font-size:9.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#028FA2;border-bottom:1px solid #d1d5db;padding-bottom:2px;margin:12px 0 6px;break-after:avoid}
.entry{display:flex;justify-content:space-between;align-items:baseline;margin:6px 0 2px;break-after:avoid}
.entry b{color:#0a2540}.entry .org{color:#425466}.entry .right{font-size:9pt;color:#6b7280;white-space:nowrap;padding-left:12px}
ul{padding-left:16px;margin:2px 0 6px}li{font-size:10pt;margin:1px 0}
p{margin:0 0 8px;font-size:10.5pt}
.gap{height:10px}`;

function toHTML(blocks: DocBlock[]): string {
  let html = "";
  let inList = false;
  for (const b of blocks) {
    if (b.kind !== "bullet" && inList) { html += "</ul>"; inList = false; }
    if (b.kind === "bullet") { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${esc(b.text)}</li>`; }
    else if (b.kind === "name") html += `<div class="name">${esc(b.text)}</div>`;
    else if (b.kind === "contact") html += `<div class="contact">${esc(b.text)}</div>`;
    else if (b.kind === "heading") html += `<h2>${esc(b.text)}</h2>`;
    else if (b.kind === "entry") html += `<div class="entry"><span><b>${esc(b.title)}</b>${b.org ? ` <span class="org">| ${esc(b.org)}</span>` : ""}</span>${b.right ? `<span class="right">${esc(b.right)}</span>` : ""}</div>`;
    else if (b.kind === "para") html += `<p>${esc(b.text).split("\n").join("<br>")}</p>`;
    else html += `<div class="gap"></div>`;
  }
  return inList ? html + "</ul>" : html;
}

// Zero page margins stop the browser from printing its date/URL header and footer.
// The repeating table header/footer rows give every printed page its own top and bottom margin.
export function downloadPDF(title: string, blocks: DocBlock[]): void {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>
<table class="page"><thead><tr><td><div class="m"></div></td></tr></thead><tfoot><tr><td><div class="m"></div></td></tr></tfoot>
<tbody><tr><td>${toHTML(blocks)}</td></tr></tbody></table></body></html>`;
  const win = window.open("", "_blank");
  if (!win) throw new Error("Allow pop-ups for this site to download the PDF.");
  win.document.write(html);
  win.document.close();
  win.onafterprint = () => win.close();
  setTimeout(() => win.print(), 300);
}

export async function downloadWord(fileName: string, blocks: DocBlock[]): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, TabStopType } = await import("docx");
  const ACCENT = "028FA2", NAVY = "0A2540", MUTED = "425466";
  const RIGHT_TAB = 10080; // twips: 7 inch text width on letter paper with 0.75 inch margins
  const children = blocks.map((b) => {
    switch (b.kind) {
      case "name":
        return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: b.text, bold: true, size: 36, color: NAVY })] });
      case "contact":
        return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 4 } }, children: [new TextRun({ text: b.text, size: 18, color: MUTED })] });
      case "heading":
        return new Paragraph({ spacing: { before: 200, after: 80 }, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB", space: 2 } }, children: [new TextRun({ text: b.text.toUpperCase(), bold: true, size: 19, color: ACCENT })] });
      case "entry":
        return new Paragraph({ spacing: { before: 100, after: 20 }, keepNext: true, tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }], children: [
          new TextRun({ text: b.title, bold: true, color: NAVY }),
          ...(b.org ? [new TextRun({ text: ` | ${b.org}`, color: MUTED })] : []),
          ...(b.right ? [new TextRun({ text: `\t${b.right}`, size: 18, color: "6B7280" })] : []),
        ] });
      case "bullet":
        return new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: [new TextRun({ text: b.text, size: 20 })] });
      case "para":
        return new Paragraph({ spacing: { after: 160 }, children: b.text.split("\n").map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : undefined })) });
      default:
        return new Paragraph({ children: [] });
    }
  });
  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 1008, bottom: 1008, left: 1080, right: 1080 } } }, children }],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName.endsWith(".docx") ? fileName : `${fileName}.docx` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Plain text (cover letters, or a resume without structure) to blocks.
export function textToBlocks(text: string, detectResumeHeadings = false): DocBlock[] {
  const blocks: DocBlock[] = [];
  for (const para of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    // Resumes: one block per line. Letters: keep line breaks inside a paragraph (e.g. "Sincerely," then the name).
    for (const line of detectResumeHeadings ? para.split("\n") : [para.trim()]) {
      const t = line.trim();
      if (!t) continue;
      if (detectResumeHeadings && /^[A-Z][A-Z\s&/,]{3,}$/.test(t)) blocks.push({ kind: "heading", text: t });
      else if (/^[-•]\s+/.test(t)) blocks.push({ kind: "bullet", text: t.replace(/^[-•]\s*/, "") });
      else blocks.push({ kind: "para", text: t });
    }
  }
  return blocks;
}

export function safeFileName(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(" ").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 100) || "document";
}
