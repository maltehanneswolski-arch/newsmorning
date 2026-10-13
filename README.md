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
- `editions/YYYY-MM-DD.html` is that day's briefing as a web page. It is
  rendered from the same source the email is built from, not copied out of the
  email: the mail is a 780px table layout with every rule inlined to survive
  Gmail and Outlook, which in a browser reads as a cramped column wrapped in
  email scaffolding.
- `assets/edition.css` styles every edition. Its palette is the four colours
  the article photographs are dithered to, so the pictures and the page around
  them are the same artwork.
- `editions.json` is the archive manifest: date, path, title and section count.

Article art and source links point at
[newsletter-digest-appendix](https://github.com/maltehanneswolski-arch/newsletter-digest-appendix)
by absolute URL, so no assets are copied here.

Everything except this file is written by `scripts/publish-site.sh` in the
private automation repository, which runs after the digest is rendered and the
art is published. Editions are never deleted or rewritten; publishing the same
day again replaces that day's page and leaves the rest alone.
