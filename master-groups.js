(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterGroups = api;
})(globalThis, function() {
  function group(notes, topics) {
    const names = new Map(topics.map(topic => [topic.id, topic.name]));
    const byTopic = new Map();
    for (const note of notes) {
      if (note.archived || !note.content.trim()) continue;
      const topic = note.content.match(/^#\s+(.+)$/m)?.[1]?.trim() || names.get(note.topicID) || '收件匣';
      const item = note.content.match(/^##\s+(.+)$/m)?.[1]?.trim() || '未分類';
      if (!byTopic.has(topic)) byTopic.set(topic, new Map());
      const byItem = byTopic.get(topic);
      if (!byItem.has(item)) byItem.set(item, []);
      byItem.get(item).push(note);
    }
    const sort = (a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true, sensitivity: 'base' });
    return [...byTopic].sort(([a], [b]) => sort(a, b)).map(([topic, byItem]) => ({
      topic,
      items: [...byItem].sort(([a], [b]) => a === '未分類' ? -1 : b === '未分類' ? 1 : sort(a, b))
        .map(([item, notes]) => ({ item, notes }))
    }));
  }
  return { group };
});
