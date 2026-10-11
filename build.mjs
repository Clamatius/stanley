#!/usr/bin/env node
// Build an encrypted, self-contained HTML page from a plaintext source.
//
//   node build.mjs <source.txt> "<passphrase>" [out.html] [--part N]
//
// The text is rendered to HTML, encrypted with AES-256-GCM (key derived from
// the passphrase with PBKDF2-SHA256), and embedded in the page as base64.
// The page contains no plaintext and makes no network requests.
//
// Source format (plain text):
//   "===" lines       separate parts; --part N picks the Nth (default 1)
//   line 1 of a part  title (a trailing colon is dropped)
//   "Ch N."           chapter heading; paragraphs inside a chapter get a
//                     margin label from their first 4-digit year
//   blank-separated   paragraphs; text before the first chapter (or all of
//                     it, if there are no chapters) renders as plain prose
//   [text](url)       becomes a link

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { webcrypto as crypto } from "node:crypto";

const args = process.argv.slice(2);
let part = 1;
const pi = args.indexOf("--part");
if (pi !== -1) { part = Number(args[pi + 1]); args.splice(pi, 2); }
const [srcPath, passphrase, outPath = "index.html"] = args;
if (!srcPath || !passphrase || !(part >= 1)) {
  console.error('usage: node build.mjs <source.txt> "<passphrase>" [out.html] [--part N]');
  process.exit(1);
}

const ITERATIONS = 600_000;

// ---------- parse + render ----------
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) =>
  esc(s).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|[./][^\s)]*)\)/g, '<a href="$2">$1</a>');

const raw = readFileSync(srcPath, "utf8").replace(/\r\n/g, "\n");
const parts = raw.split(/^===.*$/m).map((p) => p.trim()).filter(Boolean);
if (!parts[part - 1]) {
  console.error(`source has ${parts.length} part(s); no part ${part}`);
  process.exit(1);
}
const lines = parts[part - 1].split("\n");
const title = lines.shift().trim().replace(/:$/, "");
const blocks = lines.join("\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
const isChapter = (b) => /^Ch\.?\s*\d+\.?$/i.test(b);
const hasChapters = blocks.some(isChapter);

let html = "";
let chapterOpen = false;
for (const b of blocks) {
  const ch = b.match(/^Ch\.?\s*(\d+)\.?$/i);
  if (ch) {
    if (chapterOpen) html += `</section>\n`;
    html += `<section class="chapter"><h2><span>${ch[1]}</span></h2>\n`;
    chapterOpen = true;
    continue;
  }
  if (!chapterOpen) {
    // prose: a preface before the chapters, or the whole thing if there are none
    html += `<p class="${hasChapters ? "note" : "prose"}">${inline(b)}</p>\n`;
    continue;
  }
  const year = b.match(/\b(1[89]\d\d|20\d\d)\b/);
  const label = year ? `<span class="when" aria-hidden="true">${year[1]}</span>` : "";
  html += `<p class="v">${label}${inline(b)}</p>\n`;
}
if (chapterOpen) html += `</section>\n`;

const article = `<h1>${esc(title)}</h1>\n${html}`;

// ---------- encrypt ----------
const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const norm = passphrase.trim().toLowerCase();
const baseKey = await crypto.subtle.importKey("raw", enc.encode(norm), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey(
  { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
  baseKey,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"],
);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(article)));
const b64 = (u8) => Buffer.from(u8).toString("base64");
const payload = JSON.stringify({ v: 1, it: ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(ct) });

// ---------- page ----------
const template = readFileSync(new URL("./template.html", import.meta.url), "utf8");
const page = template
  .replaceAll("__TITLE__", esc(title))
  .replace("__PAYLOAD__", payload.replace(/</g, "\\u003c"));
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, page);
console.log(`wrote ${outPath} (${(page.length / 1024).toFixed(1)} KB, part ${part}: "${title}", ${blocks.length} blocks)`);
