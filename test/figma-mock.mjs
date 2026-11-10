// A minimal stand-in for the Figma plugin API, enough to run dist/code.js in a Node vm.
// Like Figma, a text layer refuses new characters until its fonts are loaded.
import fs from 'node:fs';
import vm from 'node:vm';

let nextId = 1;
const key = (f) => `${f.family}/${f.style}`;

export function createFigma({ command = 'fill', editorType = 'figma', storage = {} } = {}) {
  const loaded = new Set();
  const mixed = Symbol('mixed');
  const log = { notify: [], ui: [], closed: null, external: [], showUI: null };

  class Node {
    constructor(type, props = {}) {
      this.id = `${nextId++}:1`;
      this.type = type;
      this.name = props.name ?? type.toLowerCase();
      this.parent = null;
      this.x = props.x ?? 0;
      this.y = props.y ?? 0;
      this.width = props.width ?? 100;
      this.height = props.height ?? 100;
    }
    get absoluteTransform() {
      let x = this.x, y = this.y;
      for (let p = this.parent; p && p.type !== 'PAGE'; p = p.parent) { x += p.x; y += p.y; }
      return [[1, 0, x], [0, 1, y]];
    }
    resize(w, h) { this.width = w; this.height = h; }
  }

  class Container extends Node {
    constructor(type, props = {}) {
      super(type, props);
      this.children = [];
      for (const c of props.children ?? []) this.appendChild(c);
    }
    appendChild(c) {
      if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
      c.parent = this;
      this.children.push(c);
    }
  }

  // text layer, or the text sublayer of a sticky. As in Figma, renaming it turns autoRename off.
  class Text extends Node {
    constructor(props = {}) {
      super('TEXT', props);
      this._chars = props.characters ?? '';
      this.autoRename = props.name === undefined;
      if (this.autoRename) this._name = this._chars;
      this.fontName = props.fontName ?? { family: 'Inter', style: 'Regular' };
      this.ranges = props.ranges ?? null; // fonts of a mixed-style text
      this.hasMissingFont = props.missingFont ?? false;
    }
    get name() { return this._name; }
    set name(v) {
      this._name = v;
      this.autoRename = false;
    }
    get characters() { return this._chars; }
    set characters(v) {
      for (const f of this.getRangeAllFontNames(0, this._chars.length)) {
        if (!loaded.has(key(f))) throw new Error(`unloaded font "${key(f)}"`);
      }
      this._chars = v;
      if (this.autoRename) this._name = v;
    }
    getRangeAllFontNames() { return this.ranges ?? [this.fontName]; }
  }

  class Sticky extends Node {
    constructor(props = {}) {
      super('STICKY', props);
      this.text = new Text({ characters: props.characters ?? '', name: 'text' });
    }
  }

  const page = new Container('PAGE', { name: 'Page 1' });
  page.selection = [];

  const figma = {
    command,
    editorType,
    mixed,
    currentPage: page,
    viewport: { center: { x: 500, y: 400 }, scrollAndZoomIntoView() {} },
    clientStorage: {
      async getAsync(k) { return storage[k]; },
      async setAsync(k, v) { storage[k] = v; },
    },
    ui: { postMessage: (m) => log.ui.push(m), onmessage: null },
    handlers: {},
    on(event, fn) { (this.handlers[event] ??= []).push(fn); },
    showUI(html, opts) { log.showUI = { html, opts }; },
    notify(message, opts) { log.notify.push({ message, error: !!opts?.error }); },
    closePlugin(message) { log.closed = message ?? ''; },
    openExternal(url) { log.external.push(url); },
    async loadFontAsync(f) {
      if (f === mixed) throw new Error('loadFontAsync(figma.mixed)');
      loaded.add(key(f));
    },
    createFrame: () => new Container('FRAME'),
    createText: () => new Text({ name: undefined }),
    createRectangle: () => new Node('RECTANGLE'),
  };

  const api = {
    figma,
    log,
    page,
    loaded,
    text: (characters, name, props = {}) => new Text({ characters, name, ...props }),
    frame: (name, children = [], props = {}) => new Container('FRAME', { name, children, ...props }),
    sticky: (characters, props = {}) => new Sticky({ characters, ...props }),
    select(...nodes) {
      for (const n of nodes) if (!n.parent) page.appendChild(n);
      page.selection = nodes;
      for (const fn of figma.handlers.selectionchange ?? []) fn();
    },
    /** the last message of a type the plugin sent to its UI */
    lastUi: (type) => log.ui.filter((m) => m.type === type).at(-1),
    /** sends a message from the UI and waits for the plugin to handle it */
    async fromUi(msg) {
      await figma.ui.onmessage(msg);
    },
  };
  return api;
}

/** runs the built plugin (dist/code.js) against a mock and lets its startup finish */
export async function runPlugin(mock) {
  const code = fs.readFileSync(new URL('../dist/code.js', import.meta.url), 'utf8');
  const context = vm.createContext({ figma: mock.figma, __html__: '<html>panel</html>', console });
  vm.runInContext(code, context, { filename: 'dist/code.js' });
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  return mock;
}
