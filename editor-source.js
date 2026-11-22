import { EditorState } from '@codemirror/state';
import { EditorView, Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { markdown } from '@codemirror/lang-markdown';
import { minimalSetup } from 'codemirror';

const ink = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: '#4A43D1' },
  { tag: tags.monospace, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }
]);
class Bullet extends WidgetType {
  constructor(glyph, checkPosition = null) { super(); this.glyph = glyph; this.checkPosition = checkPosition; }
  eq(other) { return other.glyph === this.glyph && other.checkPosition === this.checkPosition; }
  toDOM(view) {
    const span = document.createElement('span');
    span.className = `cm-bullet${this.checkPosition == null ? '' : ' cm-checkbox'}`;
    span.textContent = this.glyph;
    if (this.checkPosition != null) span.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      const current = view.state.doc.sliceString(this.checkPosition, this.checkPosition + 1);
      view.dispatch({ changes: { from: this.checkPosition, to: this.checkPosition + 1, insert: current === ' ' ? 'x' : ' ' } });
      view.focus();
    };
    return span;
  }
  ignoreEvent() { return false; }
}
function decorations(view) {
  const entries = [];
  const head = view.state.selection.main.head;
  let fence = null;
  let firstItemSeen = false;
  for (let number = 1; number <= view.state.doc.lines; number++) {
    const line = view.state.doc.line(number), raw = line.text, trimmed = raw.trim();
    if (fence) { if (trimmed.startsWith(fence)) fence = null; continue; }
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) { fence = trimmed.slice(0, 3); continue; }
    const heading = /^(\s*)(#{1,2})(\s+)(.*)$/.exec(raw);
    const firstItem = heading?.[2].length === 2 && !firstItemSeen;
    if (heading?.[2].length === 2) firstItemSeen = true;
    if (line.to < view.viewport.from || line.from > view.viewport.to) continue;
    if (heading) {
      const prefix = heading[1].length + heading[2].length + heading[3].length;
      const primary = heading[2].length === 1;
      const editing = view.hasFocus && head >= line.from && head <= line.to;
      const classes = primary ? `cm-note-h1${number === 1 ? ' cm-topic-heading' : ''}` : `cm-note-h2${firstItem ? ' cm-first-item-heading' : ''}`;
      entries.push(Decoration.line({ attributes: { class: classes + (editing ? ' cm-edited-heading' : '') } }).range(line.from));
      if (!view.hasFocus || head < line.from || head > line.from + prefix) entries.push(Decoration.replace({}).range(line.from + heading[1].length, line.from + prefix));
      continue;
    }
    const match = /^(\s*)([-+*]|\d+[.)])(\s+)(\[([ xX])\]\s*)?/.exec(raw);
    if (!match) continue;
    const depth = [...match[1]].reduce((count, char) => count + (char === '\t' ? 2 : 1), 0) / 2;
    const marker = match[2], checked = match[5]?.toLowerCase() === 'x';
    const glyph = match[4] ? (checked ? '☑' : '☐') : (/^\d/.test(marker) ? marker : ['•','▪','◦','▫'][Math.floor(depth) % 4]);
    const prefix = match[0].length;
    entries.push(Decoration.line({ attributes: { class: 'cm-note-list', style: `--list-depth:${depth}` } }).range(line.from));
    if (!view.hasFocus || head < line.from || head > line.from + prefix) {
      const checkPosition = match[4] ? line.from + match[1].length + marker.length + match[3].length + 1 : null;
      entries.push(Decoration.replace({ widget: new Bullet(glyph, checkPosition) }).range(line.from, line.from + prefix));
    }
  }
  return Decoration.set(entries, true);
}
const richMarkdown = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = decorations(view); }
  update(update) { if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) this.decorations = decorations(update.view); }
}, { decorations: plugin => plugin.decorations });

window.mountMarkdownEditor = function(textarea, options = {}) {
  const host = document.createElement('div');
  host.className = 'markdown-host';
  textarea.classList.add('editor-source');
  textarea.after(host);
  let suppress = false;
  const adapter = {
    get value() { return view.state.doc.toString(); },
    get selectionStart() { return view.state.selection.main.from; },
    get selectionEnd() { return view.state.selection.main.to; },
    focus() { view.focus(); },
    setSelectionRange(from, to) { view.dispatch({ selection: { anchor: from, head: to } }); },
    setRangeText(insert, from, to, selectionMode = 'end') {
      const anchor = selectionMode === 'select' ? from : from + insert.length;
      const head = selectionMode === 'select' ? from + insert.length : anchor;
      view.dispatch({ changes: { from, to, insert }, selection: { anchor, head } });
    },
    dispatchEvent(event) { if (event.type === 'input') options.onInput?.(); },
    setValue(value) { if (value === view.state.doc.toString()) return; suppress = true; view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } }); suppress = false; },
    destroy() { view.destroy(); host.remove(); },
    get dom() { return view.dom; }
  };
  const view = new EditorView({
    parent: host,
    doc: textarea.value,
    extensions: [
      minimalSetup,
      markdown(),
      syntaxHighlighting(ink),
      EditorView.lineWrapping,
      EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { overflow: 'auto' } }),
      richMarkdown,
      EditorView.updateListener.of(update => { if (update.docChanged && !suppress) { textarea.value = update.state.doc.toString(); options.onInput?.(); } }),
      EditorView.domEventHandlers({
        focus: () => options.onFocus?.(adapter),
        blur: () => options.onBlur?.(adapter),
        keydown: event => { options.onKeydown?.(event, adapter); return event.defaultPrevented; }
      })
    ]
  });
  textarea.editorAdapter = adapter;
  return adapter;
};
