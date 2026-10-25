const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'text',
  'tspan', 'defs', 'linearGradient', 'stop', 'title', 'ellipse', 'clipPath', 'pattern',
]);

function append(parent, child) {
  if (child == null || typeof child === 'boolean') return;
  if (Array.isArray(child)) {
    child.forEach((c) => append(parent, c));
    return;
  }
  parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
}

/**
 * Crea un elemento DOM. Le stringhe figlie diventano sempre nodi di testo,
 * quindi il contenuto inserito dall'utente non può mai essere interpretato come HTML.
 */
export function h(tag, props, ...children) {
  const isSvg = SVG_TAGS.has(tag);
  const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  let value;
  let hasValue = false;
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      if (val == null || val === false) continue;
      if (key === 'class') el.setAttribute('class', val);
      else if (key === 'style' && typeof val === 'object') {
        for (const [k, v] of Object.entries(val)) {
          if (v == null) continue;
          if (k.startsWith('--')) el.style.setProperty(k, v);
          else el.style[k] = v;
        }
      }
      else if (key === 'dataset') Object.assign(el.dataset, val);
      else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
      else if (key === 'value' && !isSvg) { value = val; hasValue = true; }
      else if (!isSvg && (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'readOnly')) el[key] = !!val;
      else el.setAttribute(key, val === true ? '' : String(val));
    }
  }
  children.forEach((c) => append(el, c));
  if (hasValue) el.value = value;
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function replaceChildren(el, ...children) {
  clear(el);
  children.forEach((c) => append(el, c));
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
