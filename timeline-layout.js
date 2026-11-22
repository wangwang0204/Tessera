(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TimelineLayout = api;
})(globalThis, function() {
  function place(events, { minTime, maxTime, width, chipWidth = 170, gap = 12 } = {}) {
    const span = Math.max(86400000, maxTime - minTime);
    const available = Math.max(1, width - chipWidth - 16);
    const rowEnds = [];
    const points = [...events].sort((a,b) => a.timestamp - b.timestamp).map(event => {
      const x = Math.round(8 + (event.timestamp - minTime) / span * available);
      let row = rowEnds.findIndex(end => x >= end + gap);
      if (row < 0) { row = rowEnds.length; rowEnds.push(-Infinity); }
      rowEnds[row] = x + chipWidth;
      return { event, x, row };
    });
    return { points, rows: rowEnds.length, height: Math.max(64, rowEnds.length * 38 + 22) };
  }
  return { place };
});
