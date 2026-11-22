(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CanvasAlign = api;
})(globalThis, function() {
  function align(rect, others, threshold = 10, gap = 16) {
    const xTargets = [], yTargets = [];
    for (const other of others) {
      xTargets.push(other.x, other.x + other.width - rect.width,
        other.x + (other.width - rect.width) / 2,
        other.x + other.width + gap, other.x - rect.width - gap);
      yTargets.push(other.y, other.y + other.height - rect.height,
        other.y + (other.height - rect.height) / 2,
        other.y + other.height + gap, other.y - rect.height - gap);
    }
    const snap = (value, targets) => {
      let nearest = value, distance = threshold + 1;
      for (const target of targets) {
        const delta = Math.abs(target - value);
        if (delta < distance) { nearest = target; distance = delta; }
      }
      return Math.max(0, Math.round(distance <= threshold ? nearest : value));
    };
    return { x: snap(rect.x, xTargets), y: snap(rect.y, yTargets) };
  }
  return { align };
});
