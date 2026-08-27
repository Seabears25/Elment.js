# elment.js — showcase site

A single-page, no-build showcase for elment.js: a live schematic of the
`Tag(attrs, children)(events)` call pattern, a running form demo built
with the real framework, a parts list of the render methods, and a
three-step get-started guide.

## Files

- `index.html` — the showcase page; loads `elment.js` via `<script src>` (this is the version for GitHub Pages — it demonstrates the "one file, drop it in" pitch for real)
- `elment.js` — the framework itself
- `index-standalone.html` — the same page with `elment.js` inlined directly, no second file needed. Use this to double-check the page locally, or to preview it anywhere without setting up a server.

**If you see `Uncaught ReferenceError: start is not defined`**, `elment.js`
didn't load — almost always because `index.html` was opened by itself
(double-clicked, or only that one file was downloaded/deployed) without
`elment.js` sitting right next to it. Either put both files together and
serve them over `http://` (see below), or just open `index-standalone.html`,
which has no external file to fail to load.

## Deploy to GitHub Pages


1. Create a new repo (or use an existing one) and add both files to the root:
   ```
   git init
   git add index.html elment.js
   git commit -m "elment.js showcase site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Source**, choose the `main` branch and
   `/ (root)` folder, then save.
3. GitHub gives you a URL shortly after, usually:
   `https://<your-username>.github.io/<repo-name>/`

No build step, no `npm install` — GitHub Pages serves the two files
exactly as they are.

## Local preview before pushing

```
cd site
python3 -m http.server 8000
```
Then open `http://localhost:8000`. (Opening `index.html` directly via
`file://` won't work — the browser blocks the `<script src="elment.js">`
fetch under the `file://` protocol, so it needs to be served over HTTP,
same as it will be on GitHub Pages.)
