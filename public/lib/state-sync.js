/* Keep published comparison data coherent across browser saves and releases. */
(function (root) {
  const copy = value => JSON.parse(JSON.stringify(value));
  const fields = ['price', 'gross', 'totalEx', 'anim15', 'discount', 'quote', 'currency', 'origCurrency', 'fx', 'docTotal', 'items', 'deliverables', 'source', 'notes', 'caveats', 'modelling', 'modelBasis', 'modelOrig', 'prepay', 'vsLowest', 'timeline', 'revisions'];
  const commercial = v => Object.fromEntries(fields.filter(k => v[k] !== undefined).map(k => [k, v[k]]));
  function signature(seed) {
    // Media-only releases must not reset local assessment edits.
    return JSON.stringify({ project: seed.project, criteria: seed.criteria, scores: seed.scores, vendors: seed.vendors.map(v => [v.id, commercial(v)]) });
  }
  function sync(state, seed) {
    if (!seed || !state || state.importedFrom) return { state, changed: false };
    const stamp = signature(seed);
    if (state.publishedSignature === stamp) return { state, changed: false };
    const next = copy(state);
    next.project = copy(seed.project); next.criteria = copy(seed.criteria);
    next.scoringNote = seed.scoringNote; next.scoringSource = seed.scoringSource;
    if (seed.groups) next.groups = copy(seed.groups);
    next.scores = next.scores || {};
    for (const sv of seed.vendors) {
      const v = next.vendors.find(v => v.id === sv.id);
      if (!v) { next.vendors.push(copy(sv)); }
      else {
        for (const k of fields) { if (sv[k] === undefined) delete v[k]; else v[k] = copy(sv[k]); }
      }
      next.scores[sv.id] = copy(seed.scores[sv.id] || {});
    }
    next.publishedSignature = stamp;
    return { state: next, changed: true };
  }
  const api = { sync, signature };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MMPublishedState = api;
})(typeof window !== 'undefined' ? window : globalThis);
