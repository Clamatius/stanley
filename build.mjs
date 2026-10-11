#!/usr/bin/env node
// Build an encrypted, self-contained index.html from a plaintext essay.
//
//   node build.mjs path/to/essay.txt "passphrase" [out.html]
//
// The essay is rendered to HTML, encrypted with AES-256-GCM (key derived from
// the passphrase with PBKDF2-SHA256), and embedded in the page as base64.
// The page contains no plaintext and makes no network requests.
//
// Source format (plain text):
//   line 1            title
//   "Ch N."           chapter heading
//   "===" line        end of document (anything after is ignored)
//   blank-separated   paragraphs; a paragraph's first 4-digit year gets a margin label

import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const [, , srcPath, passphrase, outPath = "index.html"] = process.argv;
if (!srcPath || !passphrase) {
  console.error('usage: node build.mjs <essay.txt> "<passphrase>" [out.html]');
  process.exit(1);
}

const ITERATIONS = 600_000;

// ---------- parse + render ----------
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const raw = readFileSync(srcPath, "utf8").replace(/\r\n/g, "\n");
const body = raw.split(/^===.*$/m)[0].trim();
const lines = body.split("\n");
const title = lines.shift().trim();

const blocks = lines.join("\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

let html = "";
let chapterOpen = false;
for (const b of blocks) {
  if (!chapterOpen && !/^Ch\.?\s*\d+/i.test(b)) {
    // anything before the first chapter is a preface
    html += `<p class="note">${esc(b)}</p>\n`;
    continue;
  }
  const ch = b.match(/^Ch\.?\s*(\d+)\.?$/i);
  if (ch) {
    if (chapterOpen) html += `</section>\n`;
    html += `<section class="chapter"><h2><span>${ch[1]}</span></h2>\n`;
    chapterOpen = true;
    continue;
  }
  const year = b.match(/\b(1[89]\d\d|20\d\d)\b/);
  const label = year ? `<span class="when" aria-hidden="true">${year[1]}</span>` : "";
  html += `<p class="v">${label}${esc(b)}</p>\n`;
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
  .replace("__TITLE__", esc(title))
  .replace("__PAYLOAD__", payload.replace(/</g, "\\u003c"));
writeFileSync(outPath, page);
console.log(`wrote ${outPath} (${(page.length / 1024).toFixed(1)} KB, ${blocks.length} blocks)`);
