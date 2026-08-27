/* ============================================================
   elment.js
   A dependency-free JS framework: no HTML strings, no build step.

   Core call shape:
     Tag(attrs, ...children)(events)

     - attrs: a plain object of props (class, style, value, etc.)
     - children: passed as trailing args, NOT wrapped in []
     - the whole thing returns a callable; calling it again attaches
       events / render methods and returns the finalized vnode
     - a bare function instead of an events object is shorthand
       for { onclick: fn }

   Example:
     Button({ class: 'btn' }, 'Click me')(() => console.log('hi'))

   Multiple top-level nodes go through Html(...), not bare parens
   — JS's comma operator would silently drop all but the last value:
     Html(
       Div({}, 'first'),
       Div({}, 'second')
     )

   Load this file with a plain <script src="elment.js"> tag, closed
   normally, before your app code; it defines its API as ordinary
   globals (Div, Button, If, For, start, etc.) so nothing else to wire up.
   ============================================================ */

(function (global) {

  function isVNode(x) {
    return typeof x === 'function' && x.__isVNode === true;
  }

  function makeTag(tagName) {
    return function (attrs, ...rest) {
      let props = {};
      let children;

      // Detect whether the first arg is a props object or actually a child
      // (a plain object that isn't itself a vnode counts as props)
      if (attrs && typeof attrs === 'object' && !isVNode(attrs)) {
        props = attrs;
        children = rest;
      } else {
        children = attrs === undefined ? rest : [attrs, ...rest];
      }

      const vnode = { tag: tagName, props, children, events: {} };

      function finalize(eventsOrHandler) {
        if (typeof eventsOrHandler === 'function') {
          vnode.events = { onclick: eventsOrHandler };
        } else if (eventsOrHandler && typeof eventsOrHandler === 'object') {
          vnode.events = eventsOrHandler;
        }
        // keep the callable in sync so it can still be read as a vnode
        finalize.events = vnode.events;
        return finalize;
      }

      // Make the callable itself readable as a vnode (covers the case
      // where a child is never "finalized" with a second call)
      finalize.__isVNode = true;
      finalize.tag = vnode.tag;
      finalize.props = vnode.props;
      finalize.children = vnode.children;
      finalize.events = vnode.events;

      return finalize;
    };
  }

  // A fragment wrapper — holds multiple top-level nodes, since JS's
  // comma operator can't (Html = (Div(...), Div(...)) would just
  // discard everything but the last value).
  function Html(...children) {
    return { tag: '__fragment__', props: {}, children, events: {} };
  }

  /* ============================================================
     Control-flow render methods.
     Plain functions (not tags) — they return vnodes, arrays of
     vnodes, or null, and slot directly into a children list.
     The renderer flattens arrays and skips null/undefined/false.
     ============================================================ */

  // If(condition, thenBranch, elseBranch)
  // Branches can be a vnode or a zero-arg function returning one
  // (use a function when the branch does work you don't want to
  // pay for — or that would throw — unless it's actually taken).
  function If(condition, thenBranch, elseBranch) {
    const branch = condition ? thenBranch : elseBranch;
    if (branch === undefined) return null;
    return typeof branch === 'function' ? branch() : branch;
  }

  // Else(x) — pure syntactic sugar, just returns what you pass it.
  // Lets If(cond, Div(...), Else(Div(...))) read the way you'd expect.
  function Else(branch) {
    return branch;
  }

  // For(array, mapFn) — maps data to vnodes. mapFn gets (item, index).
  function For(array, mapFn) {
    return (array || []).map(mapFn);
  }

  // While(conditionFn, bodyFn) — builds a list by repeatedly calling
  // bodyFn() while conditionFn() is true. bodyFn is responsible for
  // advancing whatever state conditionFn checks, or this loops forever.
  // Capped as a safety net against runaway loops during development.
  function While(conditionFn, bodyFn, safetyLimit = 10000) {
    const results = [];
    let i = 0;
    while (conditionFn() && i < safetyLimit) {
      results.push(bodyFn());
      i++;
    }
    return results;
  }

  // Case(value, { key: branch, ..., default: branch })
  // Branches can be a vnode or a zero-arg function returning one.
  function Case(value, cases) {
    const branch = Object.prototype.hasOwnProperty.call(cases, value)
      ? cases[value]
      : cases.default;
    if (branch === undefined) return null;
    return typeof branch === 'function' ? branch() : branch;
  }

  // Auto-generate tag functions for every standard HTML content element.
  // Excluded on purpose: document-structure tags (html, head, body, meta,
  // link, base, title) and raw-text tags (script, style) — these don't
  // fit the vnode/children model and aren't things a component tree
  // builds. Add more here if a real one is still missing.
  const tagNames = [
    // text content
    'div', 'span', 'p', 'a', 'br', 'hr', 'blockquote', 'q', 'pre', 'code',
    'kbd', 'samp', 'var', 'cite', 'abbr', 'address', 'time', 'mark',
    'small', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup', 'del',
    'ins', 'wbr',
    // headings
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup',
    // lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // sections
    'header', 'footer', 'nav', 'main', 'article', 'aside', 'section',
    // forms
    'form', 'input', 'label', 'select', 'option', 'optgroup', 'textarea',
    'button', 'fieldset', 'legend', 'datalist', 'output', 'progress',
    'meter',
    // tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
    'colgroup', 'col',
    // media / embedded
    'img', 'audio', 'video', 'source', 'track', 'canvas', 'svg', 'iframe',
    'embed', 'object', 'param', 'picture', 'figure', 'figcaption', 'map',
    'area',
    // interactive
    'details', 'summary', 'dialog', 'menu',
    // misc containers
    'template', 'slot', 'noscript'
  ];
  const el = {};
  tagNames.forEach(t => { el[t] = makeTag(t); });

  function flattenChildren(children) {
    const out = [];
    (children || []).forEach(child => {
      if (Array.isArray(child)) {
        out.push(...flattenChildren(child));
      } else if (child !== null && child !== undefined && child !== false) {
        out.push(child);
      }
    });
    return out;
  }

  function isText(v) {
    return typeof v === 'string' || typeof v === 'number';
  }

  /* ============================================================
     Diff/patch renderer.
     Builds real DOM once, then on re-render walks old vnode vs
     new vnode and only touches what actually changed, instead of
     tearing everything down and recreating it.

     Form fields get special handling: value/checked are set as
     live DOM properties, not attributes, and only touched when
     they actually differ from what's already in the field — so
     typing doesn't get clobbered by the render that its own
     keystroke triggered.
     ============================================================ */

  function createDom(vnode) {
    if (vnode === null || vnode === undefined || vnode === false) {
      return document.createComment('');
    }
    if (isText(vnode)) {
      return document.createTextNode(String(vnode));
    }
    const dom = document.createElement(vnode.tag);
    applyProps(dom, {}, vnode.props || {});
    applyEvents(dom, {}, vnode.events || {});
    flattenChildren(vnode.children).forEach(child => {
      dom.appendChild(createDom(child));
    });
    // <select>'s value only "sticks" once its <option> children exist,
    // so it's set again here, after they're appended.
    if (vnode.tag === 'select' && vnode.props && 'value' in vnode.props) {
      dom.value = vnode.props.value;
    }
    dom.__vnode = vnode;
    return dom;
  }

  function applyProps(dom, oldProps, newProps) {
    Object.keys(oldProps).forEach(key => {
      if (!(key in newProps)) {
        if (key === 'class') dom.className = '';
        else if (key === 'value') dom.value = '';
        else if (key === 'checked') dom.checked = false;
        else dom.removeAttribute(key);
      }
    });
    Object.keys(newProps).forEach(key => {
      const val = newProps[key];
      if (oldProps[key] === val) return;
      if (key === 'class') {
        dom.className = val;
      } else if (key === 'style' && typeof val === 'object') {
        Object.assign(dom.style, val);
      } else if (key === 'value') {
        // Only touch .value if it actually differs — this is what
        // stops a controlled <input> from jumping the cursor on
        // every keystroke-triggered re-render.
        if (dom.value !== val) dom.value = val;
      } else if (key === 'checked') {
        dom.checked = !!val;
      } else {
        dom.setAttribute(key, val);
      }
    });
  }

  function applyEvents(dom, oldEvents, newEvents) {
    Object.keys(oldEvents).forEach(evt => {
      if (evt === 'onmount' || evt === 'onupdate') return;
      if (newEvents[evt] !== oldEvents[evt]) {
        dom.removeEventListener(evt.replace(/^on/, ''), oldEvents[evt]);
      }
    });
    Object.keys(newEvents).forEach(evt => {
      if (evt === 'onmount') {
        if (!oldEvents.onmount) queueMicrotask(() => newEvents.onmount(dom));
        return;
      }
      if (evt === 'onupdate') {
        queueMicrotask(() => newEvents.onupdate(dom));
        return;
      }
      if (newEvents[evt] !== oldEvents[evt]) {
        dom.addEventListener(evt.replace(/^on/, ''), newEvents[evt]);
      }
    });
  }

  // Diffs a single slot: oldVNode/newVNode against the DOM node
  // currently occupying that slot in parentDom.
  function diffNode(parentDom, oldVNode, newVNode, domNode) {
    if (newVNode === undefined) {
      if (domNode) parentDom.removeChild(domNode);
      return;
    }
    if (oldVNode === undefined || domNode === undefined) {
      parentDom.appendChild(createDom(newVNode));
      return;
    }

    const oldText = isText(oldVNode);
    const newText = isText(newVNode);

    if (oldText && newText) {
      if (String(oldVNode) !== String(newVNode)) domNode.textContent = String(newVNode);
      return;
    }
    if (oldText !== newText || (!oldText && !newText && oldVNode.tag !== newVNode.tag)) {
      parentDom.replaceChild(createDom(newVNode), domNode);
      return;
    }

    // Same tag in the same slot — update it in place instead of
    // replacing it, so the actual DOM node (and its focus state)
    // survives the re-render.
    applyProps(domNode, oldVNode.props || {}, newVNode.props || {});
    applyEvents(domNode, oldVNode.events || {}, newVNode.events || {});
    diffChildren(domNode, flattenChildren(oldVNode.children), flattenChildren(newVNode.children));
    if (newVNode.tag === 'select' && newVNode.props && 'value' in newVNode.props) {
      domNode.value = newVNode.props.value;
    }
    domNode.__vnode = newVNode;
  }

  function diffChildren(parentDom, oldChildren, newChildren) {
    const max = Math.max(oldChildren.length, newChildren.length);
    // Index-based reconciliation — simple, and fine for lists that
    // don't reorder. A reordering list would want key-based matching
    // instead; worth adding if/when list output gets sorted/shuffled.
    for (let i = max - 1; i >= 0; i--) {
      if (oldChildren[i] === undefined && newChildren[i] !== undefined) {
        parentDom.appendChild(createDom(newChildren[i]));
      }
    }
    for (let i = 0; i < max; i++) {
      if (newChildren[i] === undefined && oldChildren[i] !== undefined) {
        const doomed = parentDom.childNodes[i];
        if (doomed) parentDom.removeChild(doomed);
      }
    }
    for (let i = 0; i < Math.min(oldChildren.length, newChildren.length); i++) {
      diffNode(parentDom, oldChildren[i], newChildren[i], parentDom.childNodes[i]);
    }
  }

  let __rootVNode = null;
  let __rootContainer = null;

  function mount(vnode, container) {
    __rootContainer = container;
    __rootVNode = vnode;
    container.innerHTML = '';
    const roots = vnode && vnode.tag === '__fragment__' ? flattenChildren(vnode.children) : [vnode];
    roots.forEach(child => container.appendChild(createDom(child)));
  }

  function update(vnode) {
    if (!__rootContainer) return;
    const oldRoots = __rootVNode && __rootVNode.tag === '__fragment__'
      ? flattenChildren(__rootVNode.children) : [__rootVNode];
    const newRoots = vnode && vnode.tag === '__fragment__'
      ? flattenChildren(vnode.children) : [vnode];
    __rootVNode = vnode;
    diffChildren(__rootContainer, oldRoots, newRoots);
  }

  /* ============================================================
     App runner — remembers "how to rebuild the whole tree" so
     anything (a click handler, a resolved Fetch) can trigger a
     diffed re-render without passing callbacks around everywhere.
     ============================================================ */
  let rerender = () => {};

  function start(appFn, container) {
    rerender = () => update(appFn());
    mount(appFn(), container);
  }

  /* ============================================================
     Fetch — an async render method.
     Fetch(key, loaderFn, renderFn)
       key       — cache key; the same key won't re-fetch every render
       loaderFn  — () => Promise<data>  (e.g. () => fetch(url).then(r => r.json()))
       renderFn  — ({status, data, error}) => vnode
     First render returns renderFn's "loading" branch immediately;
     when the promise settles, it stores the result and calls
     rerender() so the tree rebuilds with real data.
     ============================================================ */
  const __fetchCache = new Map();

  function Fetch(key, loaderFn, renderFn) {
    if (!__fetchCache.has(key)) {
      const entry = { status: 'loading', data: null, error: null };
      __fetchCache.set(key, entry);
      Promise.resolve()
        .then(loaderFn)
        .then(data => {
          entry.status = 'done';
          entry.data = data;
          rerender();
        })
        .catch(err => {
          entry.status = 'error';
          entry.error = err;
          rerender();
        });
    }
    return renderFn(__fetchCache.get(key));
  }

  /* ============================================================
     Helper injection — provide(key, value) / use(key)
     A tiny service locator so shared helpers (formatters, API
     clients, config) don't have to be threaded through every
     function as arguments. Provide once at startup, pull anywhere.
     ============================================================ */
  const __registry = new Map();

  function provide(key, value) {
    __registry.set(key, value);
  }

  function use(key) {
    if (!__registry.has(key)) {
      throw new Error(`elment: no helper injected for "${key}" — call provide('${key}', ...) first`);
    }
    return __registry.get(key);
  }

  /* ============================================================
     Public API — exposed as plain globals so a bare <script> tag
     is enough to use them, matching the rest of elment's
     no-build-step philosophy.

     A few tag names, capitalized, collide with real JS/DOM globals
     (div -> Div is fine, but object -> Object and map -> Map would
     silently overwrite the built-in Object and Map constructors —
     which this very file depends on internally via Object.keys,
     Object.assign, and new Map()). Those tags are still buildable,
     just via el.object(...) / el.map(...) instead of a bare global,
     so nothing on the page — including elment.js itself — gets its
     built-ins clobbered.
     ============================================================ */
  const RESERVED_GLOBALS = new Set([
    'Object', 'Map', 'Set', 'Array', 'Function', 'Date', 'Boolean',
    'Number', 'String', 'Symbol', 'Promise', 'RegExp', 'Error', 'Proxy',
    'Reflect', 'JSON', 'Math', 'Node', 'Text', 'Event', 'Document', 'Window'
  ]);

  const tagGlobals = Object.fromEntries(
    Object.entries(el)
      .map(([tag, fn]) => [tag.charAt(0).toUpperCase() + tag.slice(1), fn])
      .filter(([capName]) => !RESERVED_GLOBALS.has(capName))
  );

  const api = {
    // tag functions, capitalized (Div, Button, H1, ...) — minus the
    // handful reserved above, which stay reachable via el.<tag>
    ...tagGlobals,
    Html, If, Else, For, While, Case,
    start, mount, update, rerender: () => rerender(),
    Fetch, provide, use,
    // escape hatch: the raw lowercase tag map, and isVNode for advanced use
    el, isVNode
  };

  Object.assign(global, api);
  global.elment = api;

})(typeof window !== 'undefined' ? window : globalThis);
