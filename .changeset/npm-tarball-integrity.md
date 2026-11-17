---
"@procedures/npm": patch
---

The entry `@procedures/npm/measures` checks the bytes of a tarball against the hashes of the registry. It uses the Web Crypto API, so a browser can also use it.

- `extractRegistryDist` reads the facts of the tarball from the response of `registryVersionRequest`: the URL, `integrity`, `shasum`, `fileCount` and `unpackedSize`. The tag of the request can be an exact version.
- `checkIntegrity(bytes, integrity)` checks bytes against an integrity text with the form of W3C Subresource Integrity. It uses the strongest algorithm of the text. The check fails when the text has no hash that it knows.
- `tarballIntegrity(dist)` gives the integrity text of a version. For an old version with only `shasum`, it gives the `sha1` text of that hash, as npm does.

No export changes. A caller that reads the tarball through its own fetch, for example the bytes of `polite-crawler/api`, can check the tarball before it unpacks it.
