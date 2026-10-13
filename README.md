# newsmorning

The public reading site for the daily executive newsletter: one page per
edition, newest first.

## One-time setup

GitHub Pages has to be turned on by hand before the first deploy can succeed.
In **Settings -> Pages**, set **Source** to **GitHub Actions**, then re-run the
"Deploy reading site" workflow. The workflow asks to enable Pages itself, but
the Actions token is not allowed to create a Pages site, so that call fails
with `Resource not accessible by integration` until the switch is flipped once.

- `index.html` is generated, never edited by hand. It is rebuilt from
  `editions.json` on every publish.
- `editions/YYYY-MM-DD.html` is the rendered email for that local calendar day,
  copied verbatim. Its article art and its source links are absolute URLs into
  [newsletter-digest-appendix](https://github.com/maltehanneswolski-arch/newsletter-digest-appendix),
  so the page is self-contained and needs no asset copying.
- `editions.json` is the archive manifest: date, path, title and section count.

Both files are written by `scripts/publish-site.sh` in the private automation
repository, which runs after the digest is rendered and the art is published.
Editions are never deleted or rewritten; publishing the same day again replaces
that day's page and leaves the rest alone.
