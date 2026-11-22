(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NoteHeader = api;
})(globalThis, function() {
  function visibleTitle(content) {
    const lines = content.split('\n');
    const raw = lines[0]?.startsWith('# ') ? lines[1] : lines[0];
    let title = (raw || '').trim();
    if (title.startsWith('## ')) title = title.slice(3);
    else if (title.startsWith('# ')) title = title.slice(2);
    return title.slice(0, 60) || '未命名便利貼';
  }
  function displayHeading(raw) {
    let text = raw.trim();
    for (const marker of ['**', '__', '~~', '*', '_', '`']) {
      if (text.startsWith(marker) && text.endsWith(marker) && text.length > marker.length * 2)
        text = text.slice(marker.length, -marker.length);
    }
    return text;
  }
  function parts(content) {
    let topic = null, fence = null;
    const items = [];
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (fence) { if (line.startsWith(fence)) fence = null; continue; }
      if (line.startsWith('```') || line.startsWith('~~~')) { fence = line.slice(0, 3); continue; }
      const heading = /^(#{1,2})\s+(.+)$/.exec(line);
      if (!heading) continue;
      const name = displayHeading(heading[2]);
      if (heading[1] === '#') {
        if (topic !== null) break;
        topic = name;
      } else if (topic !== null && name && !items.includes(name)) items.push(name);
    }
    const label = items.length ? items.join(' · ') : (topic || visibleTitle(content));
    return { topic: items.length ? topic : null, label, full: items.length && topic ? `${topic}  /  ${label}` : label };
  }
  return { visibleTitle, parts, headerTitle: content => parts(content).full };
});
