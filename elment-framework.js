/* ============================================================
   elment.component.js
   Backend component DSL — define scoped, slot-based components
   in plain JS, render to HTML strings. No dependencies.

   A component file:

     const {
       Module, css, html, Slot, Loop,
       div, p, strong, hr, For, If,
     } = require('./elment.component.js')();   // fresh scope per file

     Module.componentName = 'Card';  // render name (debugging)
     Module.props = true;            // inherit parent props (scoping)
     Module.css = true;              // share parent css scope (scoping)

     // Logic — regular JavaScript works here
     const els = (i) => div('Child ' + i);

     css({
       '.card':  { color: '#ffffff' },
       '#title': { color: '#000000' },
       '.big':   { extend: '.card', fontSize: '26px' },  // extendClass
     });

     // In .elc files the quotes come off (transformed at load):
     //   css({ .card: { ... }, #title: { ... },
     //         extendClass(card, big): { font-size: '26px' } })

     // SCSS text form ($vars, nesting, &, @extend):
     css(`
       $primary: #2a7b77;
       .card {
         color: $primary;
         .title { font-size: 20px; }
         &:hover { border-color: $primary; }
       }
     `);

     // Object form also supports SCSS-style nesting:
     css({ '.card': { color: '#fff', '.title': { fontSize: '20px' }, '&:hover': { ... } } });

     module.exports = html(
       div({ '.card': true, '#title': true },   // .x -> class, #y -> id
         Slot('list'),                          // injection point
         p(props.bio),                           // late-bound child
       )(
         Slot('list')(Loop(15, (i) => els(i))), // slot definition
         { if: props.isActive },                 // conditional render
       )
     );
     // `props` is late-bound: `props.bio` records the path, the renderer
     // resolves it per render. No `(props) =>` wrapper needed — `html()`
     // is the working form of `return(this, props)`.

   Sketch-to-JS mappings (the sketch used pseudo-syntax):
     {.className #IDName}      ->  { '.className': true, '#IDName': true }
     extendClass(a, b): {...}  ->  '.b': { extend: '.a', ... }
     loop: var = i, 15, i++ ( ) ->  Loop(15, (i) => ...)
     )( if: cond )             ->  )({ if: cond })
     ChildNode('1')            ->  Slot('1')      (renamed per spec)
     return(this, props)       ->  module.exports = html(...)

   props is late-bound: `props.x` records a path, resolved per render.
   Comparisons can't use === (eager) — use eq/ne helpers:
     ({ if: eq(props.status, 'active') }, { if: ne(props.role, 'admin') })

   Second-call directive order (canonical): conditions first, then
   Slot() definitions — the render reads as a sequence:
     div(...)({ if: a }, { if: b }, Slot('x')(...))
   A dev warning fires when a condition follows a slot definition.

   Reserved directive keys (extensible): if / empty / where / switch.
   `where` and `switch` are reserved for later; only `if`/`empty`
   are implemented.
   ============================================================ */

(function (global) {

  'use strict';

  /* ---------------- vnode core ---------------- */

  function isVNode(x) {
    return !!x && x.__isVNode === true;
  }

  function syncFinalize(finalize, vnode) {
    finalize.__isVNode = true;
    finalize.tag = vnode.tag;
    finalize.props = vnode.props;
    finalize.children = vnode.children;
    finalize.events = vnode.events;
    finalize.directives = vnode.directives;
    finalize.slotDefs = vnode.slotDefs;
    finalize.slotName = vnode.slotName;
    finalize.comp = vnode.comp;
  }

  function asVNode(x) {
    if (typeof x === 'function' && x.__isVNode === true) {
      return { tag: x.tag, props: x.props, children: x.children, events: x.events, directives: x.directives, slotDefs: x.slotDefs, slotName: x.slotName, comp: x.comp, __isVNode: true };
    }
    return x;
  }

  // Directive keys handled in the second-call position.
  var DIRECTIVE_KEYS = { if: 1, empty: 1, where: 1, switch: 1 };

  // Canonical directive order: conditions before Slot() definitions, so
  // the render reads as a sequence — "if this, then fill these slots":
  //   div(...)({ if: a }, { if: b }, Slot('x')(...))
  // A dev warning fires (once per shape) when a condition follows a slot def.
  var __orderWarnings = new Set();
  function checkDirectiveOrder(tag, directives) {
    let seenSlotDef = false;
    for (const d of directives) {
      if (!d) continue;
      if (d.__isSlotDef) { seenSlotDef = true; continue; }
      if (typeof d === 'object') {
        const hasCond = Object.keys(d).some((k) => DIRECTIVE_KEYS[k]);
        if (hasCond && seenSlotDef) {
          const sig = tag;
          if (!__orderWarnings.has(sig)) {
            __orderWarnings.add(sig);
            console.warn(
              '[elment.component] <' + tag + '>: conditions should come before ' +
              'Slot() definitions — readable sequence is ifs first, slots after.'
            );
          }
          return;
        }
      }
    }
  }

  function makeTag(tagName) {
    return function (attrs, ...rest) {
      let props = {};
      let children;
      if (attrs && typeof attrs === 'object' && !isVNode(attrs) && !isPropsRef(attrs) && !(attrs instanceof Promise)) {
        props = attrs;
        children = rest;
      } else {
        children = attrs === undefined ? rest : [attrs, ...rest];
      }
      const vnode = { tag: tagName, props, children, events: {}, directives: {}, slotDefs: [], __isVNode: true };

      // Second call: variadic directives. Canonical order is conditions
      // first, then Slot() definitions — readable render sequence:
      //   div(...)({ if: a }, { if: b }, Slot('x')(...))
      //   (fn)                 -> onclick shorthand (elment.js compat)
      //   ({ if, empty })      -> conditional rendering
      //   ({ onX: fn })        -> events (string handlers survive SSR)
      //   (Slot('n')(kids))    -> slot definition for this subtree
      function finalize(...directives) {
        checkDirectiveOrder(tagName, directives);
        directives.forEach((d) => {
          if (!d) return;
          if (d.__isSlotDef) { vnode.slotDefs.push(d); return; }
          if (typeof d === 'function') { vnode.events.onclick = d; return; }
          if (typeof d === 'object') {
            Object.keys(d).forEach((k) => {
              if (k === 'if') { (vnode.directives.if || (vnode.directives.if = [])).push(d[k]); }
              else if (DIRECTIVE_KEYS[k]) vnode.directives[k] = d[k];
              else if (k.slice(0, 2) === 'on') vnode.events[k] = d[k];
            });
          }
        });
        syncFinalize(finalize, vnode);
        return finalize;
      }
      syncFinalize(finalize, vnode);
      return finalize;
    };
  }

  function Html(...children) {
    return { tag: '__fragment__', props: {}, children, events: {}, directives: {}, slotDefs: [], __isVNode: true };
  }

  /* ---------------- control flow ---------------- */

  function If(condition, thenBranch, elseBranch) {
    if (isPropsRef(condition) || isCondition(condition)) {
      return { tag: '__if__', ifCond: condition, thenBranch, elseBranch, props: {}, children: [], events: {}, directives: {}, slotDefs: [], __isVNode: true };
    }
    const branch = condition ? thenBranch : elseBranch;
    if (branch === undefined) return null;
    return typeof branch === 'function' && !isVNode(branch) ? branch() : branch;
  }
  function Else(branch) { return branch; }
  function For(array, mapFn) {
    if (isPropsRef(array)) {
      return { tag: '__for__', forArray: array, forFn: mapFn, props: {}, children: [], events: {}, directives: {}, slotDefs: [], __isVNode: true };
    }
    return (array || []).map(mapFn);
  }
  function While(conditionFn, bodyFn, safetyLimit) {
    safetyLimit = safetyLimit === undefined ? 10000 : safetyLimit;
    const results = [];
    let i = 0;
    while (conditionFn() && i < safetyLimit) { results.push(bodyFn()); i++; }
    return results;
  }
  function Case(value, cases) {
    if (isPropsRef(value)) {
      return { tag: '__case__', caseValue: value, caseBranches: cases, props: {}, children: [], events: {}, directives: {}, slotDefs: [], __isVNode: true };
    }
    const branch = Object.prototype.hasOwnProperty.call(cases, value) ? cases[value] : cases.default;
    if (branch === undefined) return null;
    return typeof branch === 'function' && !isVNode(branch) ? branch() : branch;
  }
  // Loop(n, fn) — tiny range loop; Slot-safe (each element instance
  // gets its own slot scope, so repeated slot names never collide).
  function Loop(count, fn) {
    const out = [];
    for (let i = 0; i < count; i++) out.push(fn(i));
    return out;
  }

  /* ---------------- service locator ---------------- */

  const __registry = new Map();
  function provide(key, value) { __registry.set(key, value); }
  function use(key) {
    if (!__registry.has(key)) throw new Error('elment.component: no helper injected for "' + key + '"');
    return __registry.get(key);
  }

  /* ---------------- Slot ----------------
     Slot('name')            -> injection point (renders the defined content)
     Slot('name')(...kids)   -> slot definition (goes in the second-call
                                position of the element owning the subtree)
     Scoped to the node whose directives define it; the same name can be
     reused in other nodes and inside loops without collision.           */

  function Slot(name) {
    // The point itself is a callable vnode: Slot('n') marks the injection
    // point, Slot('n')(...kids) builds the definition for it.
    function slotFn(...children) {
      return { __isSlotDef: true, slotName: name, children };
    }
    slotFn.__isVNode = true;
    slotFn.tag = '__slot__';
    slotFn.slotName = name;
    slotFn.props = {};
    slotFn.children = [];
    slotFn.events = {};
    slotFn.directives = {};
    slotFn.slotDefs = [];
    return slotFn;
  }

  /* ---------------- props proxy ----------------
     `props` is a late-bound placeholder. At module level, `props.bio`
     doesn't evaluate — it records the path ['bio']. The renderer
     resolves it against the real props per render. This is what lets
     `html(...)` replace `Module.build((props) => html(...))`:
     no function wrapper needed because nothing evaluates eagerly.

     Works in: children, ({ if }) directives, attr values, Slot content,
     Case()/If()/For() (these become lazy nodes when given a ref).
     Doesn't work: eager JS expressions (`props.a + props.b`,
     `props.list.map(...)`, ternaries, template literals) — keep those
     in regular JS logic outside the template.                        */

  function makePropsProxy(path) {
    return new Proxy({}, {
      get(t, key) {
        if (key === '__isPropsRef') return true;
        if (key === '__path') return path;
        if (typeof key === 'symbol') return undefined;
        return makePropsProxy([...path, String(key)]);
      },
    });
  }

  function isPropsRef(x) {
    return !!x && (typeof x === 'object' || typeof x === 'function') && x.__isPropsRef === true;
  }

  function resolveRef(ref, props) {
    let v = props;
    const path = ref.__path || [];
    for (let i = 0; i < path.length; i++) {
      if (v == null) return undefined;
      v = v[path[i]];
    }
    return v;
  }

  function resolveMaybeRef(v, props) {
    return isPropsRef(v) ? resolveRef(v, props) : v;
  }

  // Lazy conditions for comparisons. `props.role === 'admin'` can't work —
  // `===` evaluates eagerly against the proxy — so comparisons go through
  // helpers that compose with multi-`if` AND:
  //   span(...)({ if: props.verified }, { if: ne(props.role, 'admin') })
  function isCondition(x) {
    return !!x && (typeof x === 'object' || typeof x === 'function') && x.__isCondition === true;
  }
  function evalCondition(c, props) {
    if (isCondition(c)) return !!c.test(props);
    return !!resolveMaybeRef(c, props);
  }
  function eq(ref, value) {
    return { __isCondition: true, test: (props) => resolveMaybeRef(ref, props) === value };
  }
  function ne(ref, value) {
    return { __isCondition: true, test: (props) => resolveMaybeRef(ref, props) !== value };
  }

  /* ---------------- tags ---------------- */

  const tagNames = [
    'div', 'span', 'p', 'a', 'br', 'hr', 'blockquote', 'q', 'pre', 'code',
    'kbd', 'samp', 'var', 'cite', 'abbr', 'address', 'time', 'mark',
    'small', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup', 'del',
    'ins', 'wbr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'header', 'footer', 'nav', 'main', 'article', 'aside', 'section',
    'form', 'input', 'label', 'select', 'option', 'optgroup', 'textarea',
    'button', 'fieldset', 'legend', 'datalist', 'output', 'progress',
    'meter',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
    'colgroup', 'col',
    'img', 'audio', 'video', 'source', 'track', 'canvas', 'svg', 'iframe',
    'embed', 'object', 'param', 'picture', 'figure', 'figcaption', 'map',
    'area',
    'details', 'summary', 'dialog', 'menu',
    'template', 'slot', 'noscript'
  ];
  const el = {};
  tagNames.forEach((t) => { el[t] = makeTag(t); });

  const RESERVED_GLOBALS = new Set([
    'Object', 'Map', 'Set', 'Array', 'Function', 'Date', 'Boolean',
    'Number', 'String', 'Symbol', 'Promise', 'RegExp', 'Error', 'Proxy',
    'Reflect', 'JSON', 'Math', 'Node', 'Text', 'Event', 'Document', 'Window',
    // 'Slot' is the DSL's slot function, not the <slot> HTML element
    // (still reachable via el.slot for the rare Web Components case).
    'Slot',
  ]);
  const tagGlobals = {};
  Object.keys(el).forEach((tag) => {
    const cap = tag.charAt(0).toUpperCase() + tag.slice(1);
    if (!RESERVED_GLOBALS.has(cap)) tagGlobals[cap] = el[tag];
  });

  /* ---------------- scoped CSS ----------------
     css({ '.cls': {...}, '#id': {...}, '.b': { extend: '.a', ... } })
     At render time every class/id selector is prefixed with the
     component instance id:  .cls  ->  .iC3-cls   (#id -> #iC3-id)
     `extend: '.a'` copies .a's declarations into the rule (recursive,
     cycle-guarded) — the working form of extendClass(a, b).            */

  function camelToKebab(s) {
    return s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
  }

  function resolveExtends(rules) {
    const resolved = {};
    const visiting = new Set();
    function resolve(selector) {
      if (resolved[selector]) return resolved[selector];
      if (visiting.has(selector)) return {}; // cycle guard
      visiting.add(selector);
      const decls = rules[selector] || {};
      let out = {};
      const ext = decls.extend;
      if (ext) {
        const refs = Array.isArray(ext) ? ext : [ext];
        refs.forEach((r) => { out = { ...resolve(r), ...out }; });
      }
      Object.keys(decls).forEach((k) => { if (k !== 'extend') out[k] = decls[k]; });
      visiting.delete(selector);
      resolved[selector] = out;
      return out;
    }
    Object.keys(rules).forEach(resolve);
    return resolved;
  }

  function scopeSelector(selector, scopeId) {
    return selector
      .replace(/\.[\w-]+/g, (m) => '.' + scopeId + '-' + m.slice(1))
      .replace(/#[\w-]+/g, (m) => '#' + scopeId + '-' + m.slice(1));
  }

  function emitResolvedCss(resolved, scopeId) {
    return Object.keys(resolved).map((sel) => {
      const decls = resolved[sel];
      const body = Object.keys(decls)
        .map((k) => '  ' + camelToKebab(k) + ': ' + decls[k] + ';')
        .join('\n');
      return scopeSelector(sel, scopeId) + ' {\n' + body + '\n}';
    }).join('\n');
  }

  // SCSS-style nesting in the object form:
  //   { '.card': { color: '#fff', '.title': { ... }, '&:hover': { ... } } }
  function resolveNestedSel(sel, parent) {
    const parents = parent ? parent.split(',').map((s) => s.trim()).filter(Boolean) : [''];
    const sels = sel.split(',').map((s) => s.trim()).filter(Boolean);
    const out = [];
    parents.forEach((p) => {
      sels.forEach((s) => {
        if (s.indexOf('&') !== -1) out.push(s.replace(/&/g, p).trim());
        else out.push((p ? p + ' ' : '') + s);
      });
    });
    return out.join(', ');
  }

  function flattenNestedCss(rules) {
    const flat = {};
    function walk(obj, parentSel) {
      Object.keys(obj).forEach((sel) => {
        const body = obj[sel];
        if (!body || typeof body !== 'object' || Array.isArray(body)) return;
        const fullSel = parentSel ? resolveNestedSel(sel, parentSel) : sel;
        const decls = {};
        const nested = {};
        Object.keys(body).forEach((k) => {
          const v = body[k];
          if (v && typeof v === 'object' && !Array.isArray(v) && /^[.#&:]/.test(k)) nested[k] = v;
          else decls[k] = v;
        });
        if (Object.keys(decls).length) flat[fullSel] = { ...(flat[fullSel] || {}), ...decls };
        Object.keys(nested).forEach((k) => walk({ [k]: nested[k] }, fullSel));
      });
    }
    walk(rules, '');
    return flat;
  }

  function emitCss(rules, scopeId) {
    const resolved = resolveExtends(flattenNestedCss(rules || {}));
    return emitResolvedCss(resolved, scopeId);
  }

  /* ---------------- SCSS text compiler ----------------
     css(`...`) accepts an SCSS subset: $variables, nesting,
     & parent selector, and @extend (maps to extend:).
       css(`
         $primary: #2a7b77;
         .card {
           color: $primary;
           .title { font-size: 20px; }
           &:hover { border-color: $primary; }
           .big { @extend .card; font-size: 26px; }
         }
       `)                                                      */

  function compileScss(text, scopeId) {
    let src = String(text)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/[^\n]*/g, '$1');

    // $var: value;  (extract, then substitute)
    const vars = {};
    src = src.replace(/\$([\w-]+)\s*:\s*([^;{}]+);/g, (m, name, val) => {
      vars[name] = val.trim();
      return '';
    });
    Object.keys(vars).forEach((name) => {
      src = src.replace(new RegExp('\\$' + name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'g'), vars[name]);
    });

    const rules = {};
    function addDecl(sel, prop, val) {
      const cur = rules[sel] || (rules[sel] = {});
      if (prop === '@extend') {
        const list = cur.extend ? (Array.isArray(cur.extend) ? cur.extend.slice() : [cur.extend]) : [];
        list.push(val);
        cur.extend = list.length === 1 ? list[0] : list;
      } else {
        cur[prop] = val;
      }
    }

    function parseBody(body, parentSel) {
      let i = 0;
      const n = body.length;
      while (i < n) {
        while (i < n && /\s/.test(body[i])) i++;
        if (i >= n) break;
        // scan to next ';' or '{' at depth 0 (string/paren aware)
        let j = i, depth = 0, inStr = false, q = null;
        let found = 0, foundAt = -1;
        while (j < n) {
          const c = body[j];
          if (inStr) {
            if (c === '\\') j++;
            else if (c === q) inStr = false;
          } else if (c === '"' || c === "'") { inStr = true; q = c; }
          else if (c === '(') depth++;
          else if (c === ')') depth--;
          else if (depth === 0 && c === '{') { found = '{'; foundAt = j; break; }
          else if (depth === 0 && c === ';') { found = ';'; foundAt = j; break; }
          j++;
        }
        if (found === ';') {
          const stmt = body.slice(i, foundAt).trim();
          if (parentSel && stmt) {
            if (stmt.indexOf('@extend') === 0) {
              const target = stmt.slice(7).trim();
              if (target) addDecl(parentSel, '@extend', target);
            } else {
              const colon = stmt.indexOf(':');
              if (colon > 0) addDecl(parentSel, stmt.slice(0, colon).trim(), stmt.slice(colon + 1).trim());
            }
          }
          i = foundAt + 1;
        } else if (found === '{') {
          const rawSel = body.slice(i, foundAt).trim();
          let d = 1, k = foundAt + 1;
          inStr = false;
          while (k < n && d > 0) {
            const c = body[k];
            if (inStr) {
              if (c === '\\') k++;
              else if (c === q) inStr = false;
            } else if (c === '"' || c === "'") { inStr = true; q = c; }
            else if (c === '{') d++;
            else if (c === '}') d--;
            k++;
          }
          const inner = body.slice(foundAt + 1, k - 1);
          if (rawSel) parseBody(inner, resolveNestedSel(rawSel, parentSel));
          i = k;
        } else {
          const stmt = body.slice(i).trim();
          if (stmt && parentSel) {
            if (stmt.indexOf('@extend') === 0) {
              const target = stmt.slice(7).trim();
              if (target) addDecl(parentSel, '@extend', target);
            } else {
              const colon = stmt.indexOf(':');
              if (colon > 0) addDecl(parentSel, stmt.slice(0, colon).trim(), stmt.slice(colon + 1).trim());
            }
          }
          break;
        }
      }
    }

    parseBody(src, '');
    return emitResolvedCss(resolveExtends(rules), scopeId);
  }

  /* ---------------- HTML serialization ---------------- */

  const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  function escapeText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeText(s).replace(/"/g, '&quot;');
  }
  function scopedName(name, scopeId) {
    return scopeId ? scopeId + '-' + name : name;
  }
  function styleObjectToCss(style) {
    return Object.keys(style).map((k) => camelToKebab(k) + ':' + style[k]).join(';');
  }

  // Attr shorthand: { '.cls': true } -> class="iCn-cls",
  //                { '#id': true }  -> id="iCn-id".
  // Regular `class` also scopes any `.x` tokens inside the string.
  function renderAttrs(props, scopeId, ctxProps) {
    if (!props) return '';
    const classes = [];
    let rest = '';
    Object.keys(props).forEach((key) => {
      const rawVal = props[key];
      const val = resolveMaybeRef(rawVal, ctxProps);
      if (val === null || val === undefined || val === false) return;
      // Conditional values (eq/ne helpers) decide inclusion.
      const truthy = isCondition(rawVal) ? evalCondition(rawVal, ctxProps) : val;
      if (!truthy) return;
      if (key === 'children' || key === 'dangerouslySetInnerHTML') return;
      if (key[0] === '.' && key.length > 1) {
        if (val) classes.push(scopedName(key.slice(1), scopeId));
        return;
      }
      if (key[0] === '#' && key.length > 1) {
        if (val) rest += ' id="' + escapeAttr(scopedName(key.slice(1), scopeId)) + '"';
        return;
      }
      if (key === 'class' || key === 'className') {
        String(val).split(/\s+/).filter(Boolean).forEach((tok) => {
          classes.push(tok[0] === '.' ? scopedName(tok.slice(1), scopeId) : tok);
        });
        return;
      }
      if (key === 'id' && typeof val === 'string' && val[0] === '#') {
        rest += ' id="' + escapeAttr(scopedName(val.slice(1), scopeId)) + '"';
        return;
      }
      if (key === 'style') {
        const cssText = typeof val === 'object' ? styleObjectToCss(val) : String(val);
        if (cssText) rest += ' style="' + escapeAttr(cssText) + '"';
        return;
      }
      if (val === true) { rest += ' ' + key; return; }
      rest += ' ' + key + '="' + escapeAttr(val) + '"';
    });
    return (classes.length ? ' class="' + escapeAttr(classes.join(' ')) + '"' : '') + rest;
  }

  function renderEvents(events) {
    if (!events) return '';
    let out = '';
    Object.keys(events).forEach((key) => {
      const val = events[key];
      if (typeof val === 'string' && val) out += ' ' + key + '="' + escapeAttr(val) + '"';
    });
    return out;
  }

  function flattenChildren(children) {
    const out = [];
    (children || []).forEach((child) => {
      if (Array.isArray(child)) out.push(...flattenChildren(child));
      else if (child !== null && child !== undefined && child !== false) out.push(child);
    });
    return out;
  }

  // ctx: { scopeId, slots: Map, css: string[], props }
  async function renderNode(node, ctx) {
    node = asVNode(node);
    if (node === null || node === undefined || node === false) return '';
    if (node instanceof Promise) return renderNode(await node, ctx);
    // Late-bound props reference — resolve against this render's props.
    if (isPropsRef(node)) {
      const v = resolveRef(node, ctx.props);
      if (v == null || v === false) return '';
      if (Array.isArray(v)) {
        const parts = await Promise.all(v.map((item) => renderNode(item, ctx)));
        return parts.join('');
      }
      return renderNode(v, ctx);
    }
    if (typeof node === 'string' || typeof node === 'number') return escapeText(node);
    if (!isVNode(node)) return escapeText(String(node));

    if (node.tag === '__fragment__') {
      const parts = await Promise.all(flattenChildren(node.children).map((c) => renderNode(c, ctx)));
      return parts.join('');
    }
    if (node.tag === '__if__') {
      const c = evalCondition(node.ifCond, ctx.props);
      const branch = c ? node.thenBranch : node.elseBranch;
      if (branch === undefined) return '';
      const b = typeof branch === 'function' && !isVNode(branch) ? branch() : branch;
      return renderNode(b, ctx);
    }
    if (node.tag === '__case__') {
      const v = resolveMaybeRef(node.caseValue, ctx.props);
      const cases = node.caseBranches;
      const branch = Object.prototype.hasOwnProperty.call(cases, v) ? cases[v] : cases.default;
      if (branch === undefined) return '';
      const b = typeof branch === 'function' && !isVNode(branch) ? branch() : branch;
      return renderNode(b, ctx);
    }
    if (node.tag === '__for__') {
      const arr = resolveMaybeRef(node.forArray, ctx.props) || [];
      const parts = await Promise.all(arr.map((item, i) => renderNode(node.forFn(item, i), ctx)));
      return parts.join('');
    }
    if (node.tag === '__slot__') {
      const def = ctx.slots.get(node.slotName);
      if (!def) return '';
      const parts = await Promise.all(flattenChildren(def.children).map((c) => renderNode(c, ctx)));
      return parts.join('');
    }
    if (node.tag === '__component__') {
      return renderComponent(node, ctx);
    }

    const dir = node.directives || {};
    const ifs = dir.if || [];
    if (ifs.length && !ifs.every((c) => evalCondition(c, ctx.props))) {
      return dir.empty ? renderNode(dir.empty, ctx) : '';
    }

    // Slot definitions on this element scope its subtree.
    let slots = ctx.slots;
    if (node.slotDefs && node.slotDefs.length) {
      slots = new Map(ctx.slots);
      node.slotDefs.forEach((d) => slots.set(d.slotName, d));
    }
    const childCtx = { ...ctx, slots };

    const tag = node.tag;
    const props = node.props || {};
    let outHtml = '<' + tag + renderAttrs(props, ctx.scopeId, ctx.props) + renderEvents(node.events);
    if (VOID_ELEMENTS.has(tag)) return outHtml + '>';
    outHtml += '>';
    if (props.dangerouslySetInnerHTML) {
      outHtml += props.dangerouslySetInnerHTML;
    } else {
      const parts = await Promise.all(flattenChildren(node.children).map((c) => renderNode(c, childCtx)));
      outHtml += parts.join('');
    }
    return outHtml + '</' + tag + '>';
  }

  let scopeCounter = 0;

  async function renderComponent(node, ctx) {
    const comp = node.comp;
    // Invocation-level directives (second call on the component).
    const dir = node.directives || {};
    const ifs = dir.if || [];
    if (ifs.length && !ifs.every((c) => evalCondition(c, ctx.props))) {
      return dir.empty ? renderNode(dir.empty, ctx) : '';
    }
    const ownProps = { ...(node.props || {}) };
    if (node.children && node.children.length) ownProps.children = node.children;
    const props = comp.inheritProps ? { ...ctx.props, ...ownProps } : ownProps;
    // Module.css = true -> share the parent scope (good for scoping);
    // otherwise a fresh instance id: iC<render order>.
    const scopeId = comp.inheritCss ? ctx.scopeId : ('iC' + (++scopeCounter));
    // Collect this subtree's CSS locally; only flush it upward when the
    // component actually renders something (an `if: false` root emits
    // no dead CSS).
    const sub = { ...ctx, props, scopeId, slots: new Map(), css: [] };
    // Caller-provided slots (second call) seed this instance's slot scope.
    (node.slotDefs || []).forEach((d) => sub.slots.set(d.slotName, d));
    const body = await renderNode(comp.template, sub);
    if (body) {
      if (comp.cssRules) ctx.css.push(emitCss(comp.cssRules, scopeId));
      (comp.cssScss || []).forEach((s) => {
        const out = compileScss(s, scopeId);
        if (out) ctx.css.push(out);
      });
      ctx.css.push(...sub.css);
    }
    return body;
  }

  function rootCtx() {
    return { scopeId: null, slots: new Map(), css: [], props: {} };
  }

  async function renderToString(vnode) {
    const ctx = rootCtx();
    const body = await renderNode(vnode, ctx);
    const style = ctx.css.length ? '<style>\n' + ctx.css.join('\n') + '\n</style>\n' : '';
    return style + body;
  }

  // renderWithCss -> { html, css } for callers that place CSS themselves.
  async function renderWithCss(vnode) {
    const ctx = rootCtx();
    const body = await renderNode(vnode, ctx);
    return { html: body, css: ctx.css.join('\n') };
  }

  async function renderDocument(opts) {
    opts = opts || {};
    const { html: body, css } = await renderWithCss(opts.body);
    const extra = opts.styles ? '\n<style>' + opts.styles + '</style>' : '';
    const style = css ? '<style>\n' + css + '\n</style>' : '';
    return '<!DOCTYPE html>\n<html lang="' + escapeAttr(opts.lang || 'en') + '">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + escapeText(opts.title || '') + '</title>\n' + style + extra + '\n</head>\n<body>\n' +
      body + '\n</body>\n</html>';
  }

  /* ---------------- .elc file extension ----------------
     Component files use their own extension. `.elc` files are JS, plus
     an optional css pseudo-syntax that mirrors the sketch:
       css({
         .card: { color: '#fff' },          // -> '.card':
         #title: { color: '#000' },         // -> '#title':
         extendClass(card, big): {          // -> '.big': { extend: '.card',
           font-size: '26px',
         },
       })
     The loader transforms these into valid JS before compiling, so
     `.elc` is a real DSL file format, not just renamed JS.
       const { registerExtension } = require('./elment.component.js')();
       registerExtension('.elc');
       const Card = require('./card.elc');                        */

  function normCssSel(s) {
    return (s[0] === '.' || s[0] === '#') ? s : '.' + s;
  }

  // Extract balanced { ... } starting at src[start] === '{'.
  // String-aware so braces inside quotes don't confuse depth.
  function extractBalanced(src, start) {
    let depth = 0, instr = false, q = null, esc = false;
    let i = start;
    for (; i < src.length; i++) {
      const c = src[i];
      if (instr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === q) instr = false;
      } else {
        if (c === '"' || c === "'" || c === '`') { instr = true; q = c; }
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) break; }
      }
    }
    return { end: i + 1, inner: src.slice(start + 1, i) };
  }

  function transformCssInner(inner) {
    const lines = inner.split('\n');
    let depth = 0;
    return lines.map((line) => {
      let t = line;
      if (depth === 0) {
        // extendClass(a, b): {  ->  'b': { extend: 'a',
        t = t.replace(
          /extendClass\s*\(\s*([.#]?[\w-]+)\s*,\s*([.#]?[\w-]+)\s*\)\s*:\s*\{/,
          (m, a, b) => `'${normCssSel(b)}': { extend: '${normCssSel(a)}',`
        );
        // .name:  ->  '.name':     #name:  ->  '#name':
        // (only unquoted selector keys at the top level of css())
        t = t.replace(/^(\s*)([.#])([\w-]+)(\s*:)/, "$1'$2$3'$4");
      } else {
        // font-size:  ->  'font-size':  (kebab-case props aren't valid JS keys)
        t = t.replace(/^(\s*)([a-zA-Z][\w-]*-[\w-]*)(\s*:)/, "$1'$2'$3");
      }
      // crude string-stripped brace count for depth tracking
      const stripped = line.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '');
      depth += (stripped.match(/{/g) || []).length - (stripped.match(/}/g) || []).length;
      return t;
    }).join('\n');
  }

  function transformElcSource(src) {
    let out = '';
    let i = 0;
    while (i < src.length) {
      const idx = src.indexOf('css(', i);
      if (idx === -1) { out += src.slice(i); break; }
      // must not be part of a longer identifier (e.g. mycss()
      const prev = idx > 0 ? src[idx - 1] : '';
      if (/[\w$]/.test(prev)) { out += src.slice(i, idx + 4); i = idx + 4; continue; }
      let j = idx + 4;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] !== '{') { out += src.slice(i, j); i = j; continue; }
      const { end, inner } = extractBalanced(src, j);
      let k = end;
      while (k < src.length && /\s/.test(src[k])) k++;
      if (src[k] !== ')') { out += src.slice(i, end); i = end; continue; }
      out += src.slice(i, idx) + 'css({' + transformCssInner(inner) + '})';
      i = k + 1;
    }
    return out;
  }

  function registerExtension(ext) {
    ext = ext || '.elc';
    try {
      const fs = require('fs');
      require.extensions[ext] = function (module, filename) {
        const src = fs.readFileSync(filename, 'utf8');
        module._compile(transformElcSource(src), filename);
      };
    } catch (e) { /* non-CommonJS host */ }
    return ext;
  }

  /* ---------------- Module scope ----------------
     const { Module, css, html, Slot, ...tags } = require('elment.component.js')();
     One scope per component file. Module.build(renderFn) is the working
     form of `return(this, props)` — `this` being the scope.              */

  function createScope() {
    const scope = {
      _name: 'anonymous',
      _inheritProps: false,
      _inheritCss: false,
      _cssRules: null,
    };

    const Module = {};
    Object.defineProperties(Module, {
      componentName: {
        get() { return scope._name; },
        set(v) { scope._name = String(v); },
        enumerable: true,
      },
      props: {
        get() { return scope._inheritProps; },
        set(v) { scope._inheritProps = !!v; },
        enumerable: true,
      },
      css: {
        get() { return scope._inheritCss; },
        set(v) { scope._inheritCss = !!v; },
        enumerable: true,
      },
    });
    // Late-bound props placeholder for this scope's templates.
    const props = makePropsProxy([]);

    // html(vnode) — finalizes the component (the working form of
    // `return(this, props)`). Captures the template with its `props`
    // placeholders and returns the callable component, wired with this
    // scope's Module params. Usage:
    //   module.exports = html(div(p(props.bio))({ if: props.isActive }));
    // The returned component also accepts a second call for directives
    // and caller-provided slots, same as elements:
    //   Tabs({ tabs, active })(Slot('a')(panelA), { if: showTabs })
    function html(vnode) {
      const comp = {
        name: scope._name,
        inheritProps: scope._inheritProps,
        inheritCss: scope._inheritCss,
        cssRules: scope._cssRules,
        cssScss: scope._cssScss,
        template: vnode,
      };
      function componentFn(p, ...rest) {
        let propsArg = {};
        let children;
        if (p && typeof p === 'object' && !isVNode(p) && !isPropsRef(p) && !(p instanceof Promise)) {
          propsArg = p;
          children = rest;
        } else {
          children = p === undefined ? rest : [p, ...rest];
        }
        const cvnode = { tag: '__component__', comp, props: propsArg, children, events: {}, directives: {}, slotDefs: [], __isVNode: true };
        function finalize(...directives) {
          checkDirectiveOrder('component:' + comp.name, directives);
          directives.forEach((d) => {
            if (!d) return;
            if (d.__isSlotDef) { cvnode.slotDefs.push(d); return; }
            if (typeof d === 'object') {
              Object.keys(d).forEach((k) => {
                if (k === 'if') { (cvnode.directives.if || (cvnode.directives.if = [])).push(d[k]); }
                else if (DIRECTIVE_KEYS[k]) cvnode.directives[k] = d[k];
              });
            }
          });
          syncFinalize(finalize, cvnode);
          return finalize;
        }
        syncFinalize(finalize, cvnode);
        return finalize;
      }
      componentFn.__isComponent = true;
      componentFn.comp = comp;
      return componentFn;
    }

    function css(rules) {
      // css({...}) object form (supports nesting + extend),
      // css(`...`) SCSS text form ($vars, nesting, &, @extend).
      if (typeof rules === 'string') {
        (scope._cssScss || (scope._cssScss = [])).push(rules);
      } else {
        scope._cssRules = { ...(scope._cssRules || {}), ...(rules || {}) };
      }
    }

    // Lowercase aliases (div, p, hr, ...) matching the sketch style,
    // alongside the capitalized globals (Div, P, Hr, ...).
    const lowerTags = {};
    Object.keys(el).forEach((tag) => { lowerTags[tag] = el[tag]; });

    return {
      Module, css, html, props,
      Slot, Loop, eq, ne,
      Html, If, Else, For, While, Case,
      provide, use,
      renderToString, renderWithCss, renderDocument,
      registerExtension,
      el, isVNode,
      ...tagGlobals,
      ...lowerTags,
    };
  }

  /* ---------------- public API ---------------- */

  const api = {
    createScope,
    // direct (single shared scope) access for quick scripts
    ...createScope(),
  };

  // Calling the module returns a fresh scope: require('elment.component.js')()
  function factory() { return createScope(); }
  Object.assign(factory, api);
  Object.assign(global, { elmentComponent: factory });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory;
  } else {
    global.elmentComponent = factory;
  }

})(typeof window !== 'undefined' ? window : globalThis);
