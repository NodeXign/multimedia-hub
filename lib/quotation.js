/* Pure quotation calculations, shared by the browser and validation scripts. */
(function (root) {
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const valid = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e9;
  function rows(v) {
    const out = (v.items || []).map((it, i) => {
      const minutes = /\/min\b/i.test(it.label), seconds = minutes || /\/sec\b/i.test(it.label);
      return { id: 'item' + i, label: it.label.replace(/\s*\/\w+$/, ''), unit: seconds ? 'sec' : 'image', qty: valid(it.qty) ? it.qty * (minutes ? 60 : 1) : null, rate: valid(it.unit) ? it.unit / (minutes ? 60 : 1) : null };
    });
    if (valid(v.modelling) && v.modelling > 0) out.push({ id: 'modelling', label: 'Modelling allowance', unit: 'lot', qty: 1, rate: v.modelling });
    out.push({ id: 'pages', label: 'Drawings / document pages', unit: 'page', qty: 0, rate: null });
    return out;
  }
  function total(items) {
    let sum = 0, missing = 0;
    for (const r of items) {
      if (!valid(r.qty) || (r.qty > 0 && !valid(r.rate))) { missing++; continue; }
      if (r.qty) sum += round(r.qty * r.rate);
    }
    return { amount: round(sum), missing };
  }
  function summary(base, draft, quote) {
    const b = total(base), d = total(draft);
    return { base: b, draft: d, delta: b.missing || d.missing ? null : round(d.amount - b.amount), quoteDelta: d.missing || !valid(quote) ? null : round(d.amount - quote) };
  }
  const api = { rows, total, summary, valid, round };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MMQuotation = api;
})(typeof window !== 'undefined' ? window : globalThis);
