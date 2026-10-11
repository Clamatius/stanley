# stanley

An essay, encrypted in the browser. The published page contains only an
AES-256-GCM ciphertext; the key is derived from a passphrase with PBKDF2 and
never leaves the reader's tab. No fonts, scripts or requests from anywhere else.

## Rebuild

```sh
node build.mjs ~/path/to/stanleys_legacy.txt "passphrase"
git commit -am "update" && git push
```

`build.mjs` reads the plaintext (which is gitignored — keep it out of here),
renders it, encrypts it and writes `index.html`. Anything after a `===` line in
the source is ignored, so a second document can live in the same file.

Passphrases are trimmed and lowercased on both sides.
