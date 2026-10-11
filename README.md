# stanley

An essay, encrypted in the browser. The published page contains only an
AES-256-GCM ciphertext; the key is derived from a passphrase with PBKDF2 and
never leaves the reader's tab. No fonts, scripts or requests from anywhere else.

## Rebuild

```sh
node build.mjs ~/path/to/stanleys_legacy.txt "passphrase"                              # part 1 -> index.html
node build.mjs ~/path/to/stanleys_legacy.txt "passphrase" postscript/index.html --part 2
git commit -am "update" && git push
```

`build.mjs` reads the plaintext (which is gitignored — keep it out of here),
renders it, encrypts it and writes the page. `===` lines split the source into
parts; `--part N` picks one. The first line of a part is its title.

**The title is the one thing not encrypted** — it's shown on the lock screen
and in the tab — so keep it innocuous.

Chaptered parts (`Ch N.` headings) get a year label in the margin per
paragraph; unchaptered parts render as plain prose. `[text](url)` makes a link,
e.g. `[the first part](../)`.

Passphrases are trimmed and lowercased on both sides.
