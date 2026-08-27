# elment.js

A dependency-free JavaScript framework. No bundler, no `npm install`, no
build step — one file, dropped in with a `<script>` tag.

**[Live demo →](https://<your-username>.github.io/<repo-name>/)**
*(update this link once GitHub Pages is live — see below)*

## Why

Most frameworks assume a build pipeline. elment.js doesn't:

- **One file.** Copy `elment.js` next to your HTML and load it.
- **No compiler.** Every element is built with a plain JS function call — no JSX, no template syntax to transpile.
- **A real diff/patch engine.** Re-renders update only what changed, so a controlled `<input>` keeps focus and cursor position while you type.
- **Everything is a function.** Conditionals, loops, async data — no special template syntax, just functions that return vnodes.

## Install

Download `elment.js` and load it before your app code:

```html
<script src="elment.js"></script>
<script>
  // Div, Button, If, For, start, etc. are now available as globals
</script>
```

There's nothing to `npm install` and no build step to run.

## Quick start

```html
<div id="root"></div>
<script src="elment.js"></script>
<script>
  start(() =>
    Button({ class: 'btn' }, 'Click me')(() => alert('hi')),
  document.getElementById('root'));
</script>
```

## The core pattern

Every element is **built**, then **wired**:

```js
Tag(attrs, ...children)(events)
```

- `attrs` — a plain object of props (`class`, `style`, `value`, ...)
- `children` — passed as trailing arguments, not wrapped in `[]`
- calling the result again attaches events; a bare function is shorthand for `{ onclick: fn }`

```js
Button({ class: 'btn' }, 'Click me')(handleClick)

Div({ class: 'card' },
  H1({}, 'Title'),
  P({}, 'Some text')
)
```

Multiple top-level elements go through `Html(...)`, not bare parentheses —
JS's comma operator would silently discard all but the last value:

```js
Html(
  Div({}, 'first'),
  Div({}, 'second')
)
```

## API reference

### Tags

Tag functions are auto-generated and capitalized: `Div`, `Span`, `Button`,
`H1`–`H6`, `P`, `A`, `Img`, `Ul`, `Ol`, `Li`, `Input`, `Label`, `Section`,
`Header`, `Footer`, `Nav`, `Main`, `Article`, `Aside`, `Form`, `Select`,
`Option`, `Textarea`, `Table`, `Thead`, `Tbody`, `Tr`, `Td`, `Th`, and
every other standard HTML content element — see the `tagNames` list at
the top of `elment.js` for the full set (~97 tags).

Two tags are exceptions: `<object>` and `<map>` are available as
`el.object(...)` / `el.map(...)` rather than bare `Object(...)` /
`Map(...)` globals, since those capitalized names would silently
overwrite the real JS `Object` and `Map` built-ins that `elment.js`
itself depends on internally.

### Control flow — plain functions, not template syntax

| Function | Signature | Does |
|---|---|---|
| `If` / `Else` | `If(cond, then, Else(else))` | Conditional branch. Branches can be a vnode or a zero-arg function (for lazy/guarded branches). |
| `For` | `For(array, (item, i) => vnode)` | Maps data to a list of vnodes. |
| `Case` | `Case(value, { key: branch, ..., default: branch })` | Switch-style branching. |
| `While` | `While(condFn, bodyFn, safetyLimit?)` | Builds a list by looping until `condFn()` is false. Capped at 10,000 iterations by default. |

All four return a vnode, an array of vnodes, or `null` — they drop
straight into a children list; the renderer flattens arrays and skips
`null`/`undefined`/`false`.

### Async — `Fetch`

```js
Fetch(key, loaderFn, renderFn)
```

- `key` — cache key; the same key won't re-fetch on every render
- `loaderFn` — `() => Promise<data>` (e.g. `() => fetch(url).then(r => r.json())`)
- `renderFn` — `({status, data, error}) => vnode`, where `status` is `'loading' | 'done' | 'error'`

Renders the loading state immediately; when the promise settles, stores the
result and triggers a re-render automatically.

### Helper injection — `provide` / `use`

```js
provide('formatDate', (d) => d.toLocaleDateString());
// ...anywhere else:
const formatDate = use('formatDate');
```

A small service locator so shared helpers don't have to be threaded
through every function as arguments. Throws if you `use()` a key that was
never `provide()`d.

### Rendering

- `start(appFn, container)` — mounts `appFn()` into `container` and sets up `rerender()`
- `rerender()` — re-runs the app function and diffs the result against the current DOM
- `mount(vnode, container)` / `update(vnode)` — lower-level primitives `start` is built on, for custom render loops

## Known limitations

- **List diffing is index-based**, not keyed. Fine for lists that only grow/shrink at the end; a `For()`-generated list that reorders or filters mid-list will misbehave. Keyed diffing is the natural next addition.
- No SSR / no virtual DOM outside the browser — `elment.js` assumes `document` exists.

## Demo site

`index.html` in this repo is a live showcase — the same file that's
deployed to GitHub Pages. `index-standalone.html` is the identical page
with `elment.js` inlined, for previewing without a server.

## Deploying the demo to GitHub Pages

1. Push `index.html`, `index-standalone.html`, and `elment.js` to the repo root.
2. **Settings → Pages → Source** → branch `main`, folder `/ (root)` → Save.
3. GitHub publishes it at `https://<your-username>.github.io/<repo-name>/` shortly after.

If you see `Uncaught ReferenceError: start is not defined` when opening
`index.html`, it means `elment.js` didn't load — almost always because
`index.html` was opened on its own (double-clicked, or only that one file
was downloaded) without `elment.js` sitting next to it. Either serve both
files together over `http://`, or open `index-standalone.html`, which has
no external file to fail to load.

## License

MIT
