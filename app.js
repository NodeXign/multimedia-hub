/* Multimedia Hub V1.0 – local-first vendor comparison dashboard (vanilla JS, no build step). */
const P = window.MMParse, LS = 'mmhub.state.v2';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const money = (n, cur) => n == null ? '—' : `${cur ? cur + ' ' : ''}${Number(n).toLocaleString('en-SG', { maximumFractionDigits: 2 })}`;
const fx1 = n => (Math.round(n * 10) / 10).toLocaleString('en-SG');
let S, ui = { sel: new Set(), sort: 'score', dir: 'desc', modal: null, lb: null, idx: {}, cidx: {} };
const blobUrls = {};
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
// Online build: files under /files/ exist only on the local server -> use hosted copies or the OneDrive link.
function webify() { if (LOCAL) return; for (const m of allMedia()) { const loc = u => (u || '').startsWith('/files/'); if (!loc(m.src) && !loc(m.orig)) continue; if (m.embed) { m.kind = 'embed'; m.src = m.embed; m.orig = m.link || m.embed; } else if (m.web) { if (loc(m.src)) m.src = m.web; m.orig = m.web; } else if (m.link) { m.kind = 'ext'; m.src = m.orig = m.link; } else if (m.kind === 'video') { m.kind = 'ext'; m.src = m.orig = ''; } else m.offline = true; } } // offline = document too large to host, hidden online

/* ---------- persistence: state in localStorage, imported files in IndexedDB ---------- */
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('mmhub', 1); r.onupgradeneeded = () => r.result.createObjectStore('blobs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('blobs', mode), out = fn(t.objectStore('blobs')); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }); };
const blobPut = (id, blob) => tx('readwrite', s => s.put(blob, id));
const blobDel = id => tx('readwrite', s => s.delete(id));
const blobKeys = () => tx('readonly', s => s.getAllKeys());
const blobGet = id => tx('readonly', s => s.get(id));
function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { alert('Could not save changes locally: ' + e.message); } }
const allMedia = (st = S) => [...st.vendors.flatMap(v => v.media), ...(st.unassigned || [])];
async function gc() { const used = new Set(allMedia().map(m => m.blobId).filter(Boolean)); for (const k of await blobKeys()) if (!used.has(k)) { await blobDel(k); if (blobUrls[k]) { URL.revokeObjectURL(blobUrls[k]); delete blobUrls[k]; } } }

const DEMO = () => ({
  version: 1, demo: true, project: { title: 'DEMO DATA – not Ghana Pilot information', scope: 'No workbook found. Use Import Data to load the real quotation workbook.', currency: 'SGD' },
  vendors: ['Demo Vendor A', 'Demo Vendor B', 'Demo Vendor C'].map((name, i) => ({ id: 'd' + i, name, quote: 'Demo', currency: 'SGD', price: 10000 + i * 2500, items: [], notes: '', timeline: '', revisions: '', caveats: '', deliverables: 'Demo scope', media: [], cover: null })),
  criteria: [['Visual Quality', 35], ['Price', 30], ['Relevant Experience', 20], ['Delivery Timeline', 15]].map((c, i) => ({ id: 'c' + i, name: c[0], weight: c[1], desc: 'Default criterion – score 1–5.', subs: [{ id: 'c' + i + 's0', name: c[0], max: 5, min: 1, check: 'Manual 1–5 score.', tiers: [], rationale: '' }] })),
  scores: { d0: {}, d1: {}, d2: {} }, unassigned: [], scoringSource: 'default',
});

/* ---------- media helpers ---------- */
const src = m => (m.blobId ? blobUrls[m.blobId] : m.src) || '';
const orig = m => m.orig || src(m);
const vById = id => S.vendors.find(v => v.id === id);
const mById = id => allMedia().find(m => m.id === id);
const images = v => v.media.filter(m => m.kind === 'image');
const visuals = v => v.media.filter(m => m.kind !== 'link');
const fallback = m => `<div class="fb">This item cannot be played here.<br><a href="${esc(m.link || orig(m))}" target="_blank" rel="noopener">Open original ↗</a></div>`;
window.vfb = id => fallback(mById(id) || {});
function player(m, auto) {
  const s = esc(src(m));
  if (m.kind === 'ext') return s ? `<div class="fb">▶ ${esc(m.label)}<br><br><a class="btn primary" style="text-decoration:none" href="${s}" target="_blank" rel="noopener">Open video on OneDrive ↗</a><br><br><small>Sign-in to the organisation may be required.</small></div>` : `<div class="fb">▶ ${esc(m.label)}<br><br>This video is only available in the local version (no online link yet).</div>`;
  if (!s) return fallback(m);
  if (m.kind === 'image') return `<img src="${s}" alt="${esc(m.label)}" loading="lazy">`;
  if (m.kind === 'video') return `<video src="${s}" controls preload="metadata" playsinline ${auto ? 'autoplay' : ''} onerror="this.outerHTML=window.vfb('${m.id}')"></video>`;
  if (m.kind === 'embed') return `<iframe src="${s}" allow="fullscreen; autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe>`;
  return fallback(m);
}

/* ---------- scoring ---------- */
function crit(v, c) { let got = 0, max = 0, rated = 0; for (const s of c.subs) { const x = (S.scores[v.id] || {})[s.id]; if (x == null) continue; rated++; got += x; max += s.max; } return { rated, total: c.subs.length, got, max: c.subs.reduce((a, s) => a + s.max, 0), pct: max ? got / max : null }; }
function overall(v) { let sum = 0, complete = true, any = false; for (const c of S.criteria) { const r = crit(v, c); if (r.rated < r.total) complete = false; if (r.pct != null) { any = true; sum += r.pct * c.weight; } } return { score: any ? sum : null, complete }; }
const groups = () => S.groups && S.groups.length ? S.groups : [{ id: '', name: 'Criteria' }];
const gOf = c => (groups().find(g => g.id === c.group) || groups()[0]).id;
const gCrit = g => S.criteria.filter(c => gOf(c) === g.id);
function gScore(v, g) { let sum = 0, w = 0, any = false; for (const c of gCrit(g)) { w += +c.weight || 0; const r = crit(v, c); if (r.pct != null) { any = true; sum += r.pct * c.weight; } } return { score: any ? sum : null, w }; }
const wsum = () => Math.round(S.criteria.reduce((a, c) => a + (+c.weight || 0), 0) * 100) / 100;
const weightsOk = () => Math.abs(wsum() - 100) < 0.01;
function priceInfo(list = S.vendors) {
  const priced = list.filter(v => v.price != null), curs = [...new Set(priced.map(v => v.currency || '?'))];
  const same = curs.length === 1, min = same && priced.length ? Math.min(...priced.map(v => v.price)) : null, max = same && priced.length ? Math.max(...priced.map(v => v.price)) : null;
  return { same, cur: curs[0] || '', min, max, lowest: same ? priced.find(v => v.price === min) : null };
}
function ranked() { return S.vendors.map(v => ({ v, o: overall(v) })).filter(x => x.o.score != null).sort((a, b) => b.o.score - a.o.score).map(x => x.v.id); }
const scoreLabel = (v, short) => { const o = overall(v); if (o.score == null) return '<span class="pill warn">Not Rated</span>'; return `<span class="num">${fx1(o.score)}</span>${short ? '' : ' / 100'}${o.complete && weightsOk() ? '' : ' <span class="pill warn">Provisional</span>'}`; };

/* ---------- quotation planner: drafts are separate from comparison prices ---------- */
const Q = window.MMQuotation, QKEY = 'mmhub.quotation.v1';
let qDrafts = {}, qVendor, qStorageError = false;
try { qDrafts = JSON.parse(localStorage.getItem(QKEY) || '{}'); if (!qDrafts || typeof qDrafts !== 'object' || Array.isArray(qDrafts)) qDrafts = {}; } catch (_) { qStorageError = true; }
function qSource() { return (window.SEED?.vendors || []).find(v => v.id === qVendor) || vById(qVendor); }
function qBase(v) {
  const defaults = window.SEED?.quotationDefaults?.[v.name];
  return defaults?.rows ? clone(defaults.rows) : Q.rows(v).map(r => ({ ...r, ...(defaults?.items?.[r.id] || {}) }));
}
function qRows(v) {
  const draft = qDrafts[v.id];
  if (draft && Array.isArray(draft.rows) && draft.rows.every(r => r && typeof r.id === 'string' && typeof r.label === 'string' && ['image', 'page', 'sec', 'lot'].includes(r.unit) && (r.qty === null || Q.valid(r.qty)) && (r.rate === null || Q.valid(r.rate)))) return draft.rows;
  return qBase(v);
}
function qPersist() {
  try { localStorage.setItem(QKEY, JSON.stringify(qDrafts)); qStorageError = false; } catch (_) { qStorageError = true; }
}
function qSigned(n, cur) { return n == null ? 'Pending rates' : (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n), cur); }
function qTotals() {
  const v = qSource(), base = qBase(v), rows = qRows(v), t = Q.summary(base, rows, v.price);
  const box = $('#qTotals'); if (!box) return;
  box.innerHTML = `<div class="kpis"><div class="kpi"><span>Published quotation</span><b class="num">${money(v.price, v.currency)}</b><em>Reference total; unchanged</em></div><div class="kpi"><span>Baseline itemised budget</span><b class="num">${money(t.base.amount, v.currency)}</b><em>${t.base.missing ? 'Incomplete baseline' : 'Published quantities × rates'}</em></div><div class="kpi"><span>${t.draft.missing ? 'Known subtotal' : 'Scenario budget'}</span><b class="num">${money(t.draft.amount, v.currency)}</b><em>${t.draft.missing ? t.draft.missing + ' row(s) need a quantity or rate' : 'Sum of rounded line totals'}</em></div><div class="kpi"><span>Change vs itemised baseline</span><b class="num">${qSigned(t.delta, v.currency)}</b><em>Vs published quotation: ${qSigned(t.quoteDelta, v.currency)}</em></div></div>`;
  rows.forEach((r, i) => { const el = document.querySelector(`[data-ql-total="${i}"]`); if (el) el.textContent = r.qty === 0 ? money(0) : Q.valid(r.qty) && Q.valid(r.rate) ? money(Q.round(r.qty * r.rate)) : 'Pending'; });
  $('#qStatus').textContent = (scenStatus(), qStorageError) ? 'Could not save in this browser. Export JSON to keep your draft.' : qDrafts[v.id] ? 'Draft saved in this browser only. It is not uploaded to GitHub.' : 'Published baseline loaded. Edits will be saved in this browser only.';
}
function renderQuotation() {
  const el = $('#quotation'); if (!el) return;
  if (!S.vendors.some(v => v.id === qVendor)) qVendor = sorted()[0]?.id;
  const v = qSource(); if (!v) { el.innerHTML = ''; return; }
  const base = qBase(v), rows = qRows(v), fmt = n => n == null ? '' : Number(n.toPrecision(14));
  el.innerHTML = `<div class="sec-head"><div><h2>Quotation Planner</h2><p class="lead">Plan drawing counts, document pages and video duration. Adjust quantities and rates to explore the budget.</p></div><div class="rowf"><button class="btn primary" data-act="q-apply-all" title="Copies the scenario quantities of this vendor to every other vendor; each vendor keeps its own unit rates">Apply quantities to all vendors</button><button class="btn" data-act="q-compare">Show in Compare</button><button class="btn" data-act="q-export">Export quotation JSON</button><button class="btn" data-act="q-reset">Reset this vendor</button><button class="btn" data-act="q-reset-all">Reset all</button></div></div>
    <div class="scenbar"><label for="scenNameQ"><b>Scenario name</b></label><input id="scenNameQ" class="scen-name" type="text" maxlength="80" placeholder="e.g. 4 min multimedia" value="${esc(scen.name)}"><span id="scenStatus" aria-live="polite"></span><small class="mut">1 · Name the scenario. 2 · Change the quantities below for one vendor. 3 · Apply quantities to all vendors – Compare then shows every vendor priced on these quantities, under this name.</small></div>
    <div class="panel"><div class="rowf"><label for="qVendor"><b>Vendor</b></label>${vSelect('qVendor', v.id)}<span class="pill">${esc(v.currency)} · video rates per second</span></div><p id="qStatus" class="mut" role="status" aria-live="polite"></p><div id="qTotals" aria-live="polite"></div>
    <div class="cmp-scroll"><table class="qtable"><thead><tr><th>Deliverable</th><th>Unit</th><th>Baseline qty</th><th>Baseline rate</th><th>Scenario qty</th><th>Scenario unit rate (${esc(v.currency)})</th><th>Line total (${esc(v.currency)})</th></tr></thead><tbody>${rows.map((r, i) => { const b = base.find(x => x.id === r.id); return `<tr><td><b>${esc(r.label)}</b></td><td>${esc(r.unit)}</td><td class="num">${b ? fmt(b.qty) : '—'}</td><td class="num">${b?.rate == null ? 'Not quoted' : money(b.rate)}</td><td><input type="number" min="0" max="1000000000" step="any" value="${fmt(r.qty)}" data-qi="${i}" data-qfield="qty" aria-label="${esc(r.label)} quantity"></td><td><input type="number" min="0" max="1000000000" step="any" value="${fmt(r.rate)}" placeholder="Not quoted" data-qi="${i}" data-qfield="rate" aria-label="${esc(r.label)} unit rate"></td><td class="num" data-ql-total="${i}"></td></tr>`; }).join('')}</tbody></table></div>
    <div class="note info">Planning estimate: quantities × unit rates, assuming linear pricing. Multimedia and animation are separate line items; minute-based rates are converted to seconds. No additional tax, discount or minimum fee is applied automatically. Unpriced modelling and other exclusions remain outside the estimate. Confirm scope and commercial terms with the vendor.</div>
    <p class="mut">${esc(v.notes || '')}</p><details><summary>Shared quotation baseline</summary><p>Export JSON for handover. To publish it for everyone, merge the vendor entry into QUOTATION_DEFAULTS at the top of tools/build-seed.js, rebuild the seed, then deploy. Browser drafts stay private to this browser and survive baseline updates until reset. This page does not write to the repository.</p></details></div>`;
  qTotals();
}
function qDownload() {
  const v = qSource(), payload = { [v.name]: { rows: clone(qRows(v)) } };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'quotation-' + v.id + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener('input', e => {
  const t = e.target; if (t.dataset.qi === undefined) return;
  const value = t.value.trim() === '' ? null : Number(t.value);
  if (t.validity.badInput || (value !== null && !Q.valid(value))) { t.setCustomValidity('Enter a finite number between 0 and 1,000,000,000.'); t.reportValidity(); return; }
  t.setCustomValidity('');
  const v = qSource(), rows = clone(qRows(v)); rows[Number(t.dataset.qi)][t.dataset.qfield] = value;
  qDrafts[v.id] = { rows, saved: new Date().toISOString() }; qPersist(); qTotals(); if (scen.show) renderCmpData();
});
document.addEventListener('change', e => { if (e.target.id === 'qVendor') { qVendor = e.target.value; renderQuotation(); } });

/* ---------- planner scenario shown in Compare (optional; published quotations stay as they are) ---------- */
const SKEY = 'mmhub.scenario.v1';
const scen = { show: false, name: '' };
try { const x = JSON.parse(localStorage.getItem(SKEY) || '{}'); if (x && typeof x === 'object') { scen.show = !!x.show; scen.name = String(x.name || '').slice(0, 80); } } catch (_) {}
const scenSave = () => { try { localStorage.setItem(SKEY, JSON.stringify(scen)); } catch (_) {} };
const qSrc = v => (window.SEED?.vendors || []).find(x => x.id === v.id) || v;
const qNum = n => n == null ? '—' : Number(Number(n).toPrecision(12)).toLocaleString('en-SG', { maximumFractionDigits: 2 });
function qScen(v) { // planner draft if the vendor has one, otherwise its published baseline
  const s = qSrc(v), base = qBase(s), rows = qRows(s), t = Q.total(rows);
  const lines = rows.map(r => { const b = base.find(x => x.id === r.id) || {}; return { ...r, line: r.qty === 0 ? 0 : Q.valid(r.qty) && Q.valid(r.rate) ? Q.round(r.qty * r.rate) : null, bQty: b.qty ?? null, bRate: b.rate ?? null, changed: (b.qty ?? null) !== r.qty || (b.rate ?? null) !== r.rate }; });
  const priced = lines.some(l => l.rate != null);
  return { lines, priced, total: priced ? t.amount : null, missing: t.missing, delta: priced && !t.missing && Q.valid(v.price) ? Q.round(t.amount - v.price) : null, edited: lines.some(l => l.changed) };
}
function scenInfo(vs) { // lowest complete scenario total, only when all selected vendors share one currency
  const all = vs.map(v => ({ v, s: qScen(v) })), ok = all.filter(x => x.s.priced && !x.s.missing), same = new Set(vs.map(v => v.currency)).size === 1;
  return { all, min: same && ok.length > 1 ? Math.min(...ok.map(x => x.s.total)) : null, edited: all.some(x => x.s.edited) };
}
// Turn the scenario on and jump to Compare. Scrolls explicitly: setting location.hash to the value it already has does not move the page.
function goCompare() { scen.show = true; scenSave(); if (cmpVendors().length < 2) sorted().slice(0, 4).forEach(v => ui.sel.add(v.id)); renderAll(); if (location.hash !== '#compare') history.replaceState(null, '', '#compare'); const go = () => $('#compare').scrollIntoView({ block: 'start', behavior: 'instant' }); go(); setTimeout(go, 60); setTimeout(go, 500); /* repeated: previews load and shift the layout */ }
// In-page confirmation: native confirm() is silently blocked in embedded browsers (app panes, Teams tabs), which made buttons look dead.
function sure(e) { const b = e.target.closest('button'); if (b.dataset.armed) return true; const old = b.textContent; b.dataset.armed = '1'; b.textContent = 'Click again to confirm'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = old; } }, 4000); return false; }
// Same quantities for every vendor? Compared per deliverable name; lump-sum rows (modelling) are vendor-specific and ignored.
function scenAligned(vs = S.vendors) { const sig = v => JSON.stringify(qRows(qSrc(v)).filter(r => r.unit !== 'lot').map(r => [r.label, r.qty]).sort()); const pr = vs.filter(v => qRows(qSrc(v)).some(r => r.rate != null)); return new Set(pr.map(sig)).size <= 1; }
function scenStatus() { const el = $('#scenStatus'); if (!el) return; const n = S.vendors.filter(v => qScen(v).edited).length;
  el.innerHTML = !n ? '<span class="pill">No changes yet – scenario equals the published quotations</span>' : scenAligned() ? `<span class="pill good">Aligned – all vendors use the same quantities</span> <span class="mut">${n} vendor(s) differ from their quotation.</span>` : `<span class="pill warn">Not aligned – vendors have different quantities</span> <span class="mut">Click “Apply quantities to all vendors” so every vendor is priced on the quantities shown below.</span>`; }
const scenTitle = () => scen.name.trim() || 'Quotation Planner scenario';
document.addEventListener('change', e => { if (e.target.id === 'scenShow') { scen.show = e.target.checked; scenSave(); renderCmpData(); } });
document.addEventListener('input', e => { const t = e.target; if (!t.classList || !t.classList.contains('scen-name')) return; scen.name = t.value.slice(0, 80); scenSave(); document.querySelectorAll('.scen-name').forEach(x => { if (x !== t) x.value = scen.name; }); if (scen.show) renderCmpData(); });

/* ---------- render ---------- */
function renderOverview() {
  const pi = priceInfo(), evald = S.vendors.filter(v => overall(v).complete).length, p = S.project || {};
  $('#projName').textContent = S.demo ? 'Demo data' : 'Ghana Pilot Project';
  $('#overview').innerHTML = `
    <h1 style="font-size:32px">${S.demo ? 'Demo data' : 'Ghana Pilot — Vendor Comparison'}</h1>
    <p class="lead">${esc(p.title)}${p.scope ? '<br>' + esc(p.scope) : ''}</p>
    ${S.demo ? '<div class="note"><b>Demo data.</b> These vendors and prices are placeholders, not Ghana Pilot information. Use <b>Import Data</b> to load the real workbook.</div>' : ''}
    <div class="kpis">
      <div class="kpi"><span>Total Vendors</span><b class="num">${S.vendors.length}</b><em>${S.vendors.filter(v => images(v).length).length} with portfolio images</em></div>
      <div class="kpi"><span>Lowest Quote</span><b class="num low">${pi.same ? money(pi.min, pi.cur) : '—'}</b><em>${pi.lowest ? esc(pi.lowest.name) + ' · lowest price, not automatically best' : 'Mixed currencies – not compared'}</em></div>
      <div class="kpi"><span>Price Range</span><b class="num">${pi.same ? money(pi.min) + ' – ' + money(pi.max) : '—'}</b><em>${pi.same ? esc(pi.cur) + ' · spread ' + money(pi.max - pi.min) : 'No conversion without a verified rate'}</em></div>
      <div class="kpi"><span>Vendors Evaluated</span><b class="num">${evald} / ${S.vendors.length}</b><em>${S.scoringNote ? esc(S.scoringNote) : S.scoringSource === 'excel' ? 'Scores imported from workbook' : 'Default criteria – awaiting scores'}</em></div>
    </div>
    ${p.fx && !S.demo ? `<div class="note info">Net totals are in ${esc(p.currency || 'the workbook currency')} exactly as calculated in the workbook, at its own rates (${Object.entries(p.fx).filter(e => e[1] !== 1).map(e => e[0] + ' ' + e[1]).join(', ')}${p.fxNote ? ' – “' + esc(p.fxNote) + '”' : ''}). No other conversion is applied.</div>` : ''}`;
  $('#foot').innerHTML = `Local-first: data and media stay on this computer (browser storage + local files). ${S.source ? 'Seed built from “' + esc(S.source.workbook) + '” on ' + esc(S.source.built) + '.' : ''} ${S.importedFrom ? 'Last Excel import: “' + esc(S.importedFrom) + '”.' : ''}`;
}

function scoreOrder(a, b) { const x = overall(a).score, y = overall(b).score; return (x == null) - (y == null) || (y ?? 0) - (x ?? 0) || a.name.localeCompare(b.name); }
function sorted() {
  const a = [...S.vendors];
  const key = { rec: v => v.rank || null, price: v => v.price, score: v => overall(v).score, name: v => v.name.toLowerCase(), workbook: v => S.vendors.indexOf(v) }[ui.sort], d = ui.dir === 'desc' ? -1 : 1;
  return a.sort((x, y) => { const p = key(x), q = key(y); return (p == null) - (q == null) || (p == null ? 0 : (p < q ? -1 : p > q ? 1 : 0) * d); }); // empty values always last
}
function card(v, pi) {
  const im = images(v), i = Math.min(ui.idx[v.id] ?? Math.max(0, im.findIndex(m => m.id === v.cover)), Math.max(0, im.length - 1)), cur = im[i];
  const vids = v.media.filter(m => m.kind === 'video' || m.kind === 'embed' || m.kind === 'ext'), links = v.media.filter(m => m.kind === 'link' && !m.offline);
  const low = pi.same && v.price != null && v.price === pi.min;
  return `<article class="card ${ui.sel.has(v.id) ? 'sel' : ''}">
    <div class="pv ${cur ? 'click' : ''}" ${cur ? `data-act="lb" data-v="${v.id}" data-m="${cur.id}"` : ''}>
      ${cur ? `<img src="${esc(src(cur))}" alt="${esc(v.name)} – ${esc(cur.label)}" loading="lazy"><span class="tag">${esc(cur.label)} · ${esc(cur.source)}</span>` : `<div class="ph">No portfolio images for this vendor in the workbook or folders.<br>Use <b>Edit / Media</b> to add original work.</div>`}
    </div>
    ${im.length > 1 ? `<div class="thumbs">${im.map((m, k) => `<button class="${k === i ? 'on' : ''}" data-act="pick" data-v="${v.id}" data-i="${k}" title="${esc(m.label)}"><img src="${esc(src(m))}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
    <div class="body">
      <div class="row1"><div><h3>${esc(v.name)}</h3><small>${esc(v.quote)}</small></div>
        <div class="price num ${low ? 'low' : ''}"><small>${esc(v.currency)}</small>${money(v.price)}</div></div>
      ${disc(v) ? `<small>Before discount <s>${money(v.gross, v.currency)}</s> · reduced by ${money(disc(v).amt, v.currency)} (${fx1(disc(v).pct)}% off)</small>` : ''}
      <div class="rowf">${recPill(v)}${v.recNote ? `<span class="pill warn">${esc(v.recNote)}</span>` : ''}${low ? '<span class="pill good">Lowest quote</span>' : ''}<span class="pill acc">Score ${scoreLabel(v, true)}</span>${v.docTotal != null && v.origCurrency ? `<span class="pill">Quote doc total ${money(v.docTotal, v.origCurrency)}</span>` : ''}</div>
      <dl><dt>Timeline</dt><dd>${esc(v.timeline) || '<span class="mut">Not stated</span>'}</dd>
        <dt>Scope</dt><dd>${esc(v.deliverables) || '<span class="mut">Not stated</span>'}</dd>
        ${v.caveats ? `<dt>Caveats</dt><dd>${esc(v.caveats)}</dd>` : ''}</dl>
      ${vids.length || links.length ? `<div class="chips">${vids.map(m => `<button class="chip" data-act="lb" data-v="${v.id}" data-m="${m.id}" title="${esc(m.label)}">▶ ${esc(m.label)}</button>`).join('')}${links.map(m => `<a class="chip" href="${esc(orig(m))}" target="_blank" rel="noopener" title="${esc(m.label)}">↗ ${esc(m.label)}</a>`).join('')}</div>` : ''}
      <div class="cfoot"><label class="chk"><input type="checkbox" data-act="sel" data-v="${v.id}" ${ui.sel.has(v.id) ? 'checked' : ''}> Compare</label>
        <button class="btn sm" data-act="open-vendor" data-v="${v.id}">Edit / Media</button></div>
    </div></article>`;
}
function renderGallery() {
  const pi = priceInfo();
  $('#gallery').innerHTML = `<div class="sec-head"><div><h2>Vendor Gallery</h2><p class="lead">Original reference work from the workbook and vendor folders. Click an image for full screen.</p></div>
    <div class="rowf"><label class="mut" for="sort">Sort</label><select id="sort" data-act="sort"><option value="rec">Recommendation</option><option value="score">Overall score</option><option value="price">Price</option><option value="name">Name</option><option value="workbook">Workbook order</option></select><button class="btn sm" data-act="dir" title="Switch between ascending and descending">${ui.dir === 'asc' ? '↑ Ascending' : '↓ Descending'}</button><button class="btn sm primary" data-act="add-vendor">＋ Add vendor</button></div></div>
    <div class="grid">${sorted().map(v => card(v, pi)).join('')}</div>
    ${(S.unassigned || []).length ? `<div class="note" style="margin-top:18px"><b>${S.unassigned.length} media item(s) need manual confirmation</b> – the workbook does not say which vendor they belong to. <button class="btn sm" data-act="open-import">Assign in Import Data</button></div>` : ''}`;
  $('#sort').value = ui.sort;
  const n = ui.sel.size;
  $('#selbar').innerHTML = n ? `<div class="in"><span>${n} selected${n > 4 ? ' – max 4' : n < 2 ? ' – pick at least 2' : ''}</span><button class="btn sm" data-act="go-compare" ${n < 2 || n > 4 ? 'disabled' : ''}>Compare Selected</button><button class="btn sm ghost" style="color:#fff;border-color:#555" data-act="clear-sel">Clear</button></div>` : '';
}

function vidsOf(v) { return v.media.filter(m => m.kind === 'video' || m.kind === 'embed' || m.kind === 'ext'); }
const vq = v => v.videoQuality ? `<span class="pill vq ${v.videoQuality === 'High' ? 'good' : v.videoQuality === 'Low' ? 'warn' : ''}">${esc(v.videoQuality)} quality</span>` : '';
function renderVideos() {
  const vs = sorted().filter(v => vidsOf(v).length), el = $('#videos'); if (!el) return;
  if (!vs.length) { el.innerHTML = ''; return; }
  const v = vs.find(x => x.id === ui.vv) || vs[0], list = vidsOf(v), m = list.find(x => x.id === ui.vm) || list[0];
  el.innerHTML = `<div class="sec-head"><div><h2>Video Preview</h2><p class="lead">Watch each vendor's reference videos here without leaving the page.${LOCAL ? '' : ' OneDrive videos play when this browser is signed in to the organisation’s Microsoft 365.'}</p></div></div>
    <div class="vtabs">${vs.map(x => `<button class="btn ${x.id === v.id ? 'primary' : ''}" data-act="vv" data-v="${x.id}">${esc(x.name)} <small>${vidsOf(x).length}</small> ${vq(x)}</button>`).join('')}</div>
    <div class="vwrap"><div><div class="pv">${player(m)}</div>
      <div class="rowf" style="justify-content:space-between;margin-top:8px"><span><b>${esc(m.label)}</b> <small>· ${esc(m.source)}</small> ${vq(v)}</span><span class="rowf">${m.link ? `<a class="btn sm" href="${esc(m.link)}" target="_blank" rel="noopener">Open on OneDrive ↗</a>` : ''}<button class="btn sm" data-act="lb" data-v="${v.id}" data-m="${m.id}">Full screen</button></span></div></div>
      <div class="vlist">${list.map((x, k) => `<button class="${x.id === m.id ? 'on' : ''}" data-act="vm" data-m="${x.id}"><span class="num">${k + 1}</span>${esc(x.label)}</button>`).join('')}</div></div>`;
}
// Printable export: the comparison table as shown, then one page of reference images per vendor.
function buildPrint() {
  const vs = cmpVendors(), pick = v => { const im = images(v).filter(m => !m.doc), selected = im.filter(m => m.featured), c = im.find(m => m.id === v.cover); return selected.length ? selected : [...(c ? [c] : []), ...im.filter(m => m !== c)].slice(0, 6); };
  const fig = m => `<figure><img src="${esc(src(m))}" alt=""><figcaption>${esc(m.label)} · ${esc(m.source)}</figcaption></figure>`;
  $('#printout').innerHTML = `<h1>${esc((S.project || {}).title || 'Vendor comparison')}</h1><p class="mut">Vendor comparison · ${vs.map(v => esc(v.name)).join(' · ')} · exported ${new Date().toISOString().slice(0, 10)}${(S.project || {}).scope ? '<br>' + esc(S.project.scope) : ''}</p>${$('#cmpWarn').innerHTML}
    <div class="cmp" style="--n:${vs.length}"><div class="crow head"><div class="lbl"></div>${vs.map(cmpHead).join('')}</div>${$('#cmpTop').innerHTML}
    <div class="crow media"><div class="lbl">Reference image</div>${vs.map(v => `<div>${pick(v)[0] ? fig(pick(v)[0]) : '<span class="mut">No image</span>'}</div>`).join('')}</div>${$('#cmpData').innerHTML}</div>` +
    vs.map(v => `<div class="ppage"><h2>${esc(v.name)} — reference images</h2><p class="mut">${money(v.price, v.currency)} · Overall score ${scoreLabel(v)}${v.rank ? ' · Recommended #' + v.rank : ''}${v.recNote ? ' · ' + esc(v.recNote) : ''}</p><div class="pgrid">${pick(v).map(fig).join('') || '<span class="mut">No reference images.</span>'}</div></div>`).join('');
  return Promise.all([...$('#printout').querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 6000); })));
}
const knList = v => String(v.keynotes || '').split('\n').map(x => x.trim()).filter(Boolean);
const kn = v => knList(v).length ? `<ul class="kn">${knList(v).map(x => { const i = x.indexOf(': '); return `<li>${i > 0 && i < 28 ? `<b>${esc(x.slice(0, i))}:</b>${esc(x.slice(i + 1))}` : esc(x)}</li>`; }).join('')}</ul>` : '<span class="mut">—</span>';
function renderDirectory() {
  const el = $('#directory'); if (!el) return;
  const c = x => esc(x) || '<span class="mut">—</span>';
  el.innerHTML = `<div class="sec-head"><div><h2>Vendor Directory</h2><p class="lead">Contact and background record of rendering / multimedia vendors, kept for future projects. Edit a row to update it; new vendors can be added here.</p></div>
    <div class="rowf"><button class="btn" data-act="export-xlsx">Export Excel</button><button class="btn primary" data-act="add-vendor">＋ Add vendor</button></div></div>
    <div class="cmp-scroll"><table class="dir"><thead><tr><th>Company</th><th>Location</th><th>Contact person</th><th>Email</th><th>WeChat / other</th><th style="min-width:340px">Key notes</th><th>This project</th><th></th></tr></thead><tbody>
    ${sorted().map(v => `<tr><td><b>${esc(v.company || v.name)}</b>${v.company && v.company !== v.name ? `<br><small>${esc(v.name)}</small>` : ''}</td><td>${c(v.location)}</td><td>${c(v.contact)}</td><td>${v.email ? `<a href="mailto:${esc(v.email)}">${esc(v.email)}</a>` : c('')}</td><td>${c(v.wechat)}</td><td>${kn(v)}</td>
      <td class="num">${money(v.price, v.currency)}<br><small>Score ${scoreLabel(v, true)}</small>${v.rank ? '<br>' + recPill(v) : ''}</td><td><button class="btn sm" data-act="open-vendor" data-v="${v.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
}
const recPill = v => v.rank === 1 ? '<span class="pill best">★ Best-suit recommendation</span>' : v.rank ? `<span class="pill good">Recommended #${v.rank}</span>` : '';
const disc = v => v.gross != null && v.price != null && v.gross > v.price ? { amt: v.gross - v.price, pct: (1 - v.price / v.gross) * 100 } : null;
const cmpHead = v => `<div class="${v.rank === 1 ? 'best' : ''}"><h3>${esc(v.name)}</h3><small>${esc(v.quote)}</small><div class="rowf" style="margin-top:6px">${recPill(v)}${v.recNote ? `<span class="pill warn">${esc(v.recNote)}</span>` : ''}</div></div>`;
function exportXlsx() {
  const vs = cmpVendors().length >= 2 ? cmpVendors() : [...S.vendors].sort(scoreOrder), pi = priceInfo(vs), rk = ranked(), R = [], row = (l, f) => R.push([l, ...vs.map(f)]), n1 = x => x == null ? '' : Math.round(x * 100) / 100;
  R.push([(S.project || {}).title || 'Vendor comparison']); R.push(['Exported', new Date().toISOString().slice(0, 10)]); R.push([]); R.push(['', ...vs.map(v => v.name)]);
  row('Recommendation', v => v.rank === 1 ? 'Best-suit recommendation' : v.rank ? 'Recommended #' + v.rank : ''); row('Recommendation note', v => v.recNote || ''); row('Quotation', v => v.quote || '');
  row('Currency', v => v.currency || ''); row('Total quotation', v => v.price ?? ''); row('Before discount', v => disc(v) ? v.gross : ''); row('Discount amount', v => disc(v) ? n1(disc(v).amt) : ''); row('Discount %', v => disc(v) ? n1(disc(v).pct) : '');
  const SC = [['Scenario', scenTitle()], ['Planning estimate: quantity × unit rate per vendor. Not a vendor quotation.'], [], ['Vendor', 'Deliverable', 'Unit', 'Quoted qty', 'Quoted unit rate', 'Scenario qty', 'Scenario unit rate', 'Scenario line total', 'Changed']];
  if (scen.show) { const si = scenInfo(vs), of = v => si.all.find(x => x.v === v).s;
    row('Scenario', () => scenTitle()); row('Scenario total', v => of(v).priced ? of(v).total : ''); row('Scenario change vs quotation', v => of(v).delta ?? (of(v).missing ? 'Incomplete' : '')); row('Scenario change %', v => of(v).delta != null && v.price ? n1(of(v).delta / v.price * 100) : '');
    for (const l of [...new Set(vs.flatMap(v => of(v).lines.filter(x => x.qty !== 0 || x.changed).map(x => x.label)))]) row('Scenario – ' + l, v => { const x = of(v).lines.find(y => y.label === l); return x ? `${n1(x.qty)} ${x.unit} × ${x.rate == null ? 'no rate' : n1(x.rate)} = ${x.line == null ? 'pending' : x.line}` : ''; });
    for (const v of vs) { const s = of(v); for (const x of s.lines) SC.push([v.name, x.label, x.unit, x.bQty ?? '', x.bRate == null ? '' : n1(x.bRate), x.qty ?? '', x.rate == null ? '' : n1(x.rate), x.line ?? '', x.changed ? 'Yes' : '']); SC.push([v.name, 'TOTAL', v.currency || '', '', '', '', '', s.priced ? s.total : '', '']); SC.push([v.name, 'Quotation', v.currency || '', '', '', '', '', v.price ?? '', '']); SC.push([v.name, 'Change vs quotation', v.currency || '', '', '', '', '', s.delta ?? '', '']); SC.push([]); } }
  row('Key notes', v => knList(v).map(x => '• ' + x).join('\n'));
  row('Quote document total', v => v.docTotal != null ? `${v.origCurrency || ''} ${v.docTotal}` : ''); row('Deliverables', v => v.deliverables || '');
  for (const l of [...new Set(vs.flatMap(v => (v.items || []).map(i => i.label)))]) row('Unit price – ' + l, v => ((v.items || []).find(i => i.label === l) || {}).unit ?? '');
  row('Modelling', v => v.modelling ?? ''); row('Scope caveats', v => v.caveats || ''); row('Timeline', v => v.timeline || ''); row('Revision rounds', v => v.revisions || ''); row('Prepayment', v => typeof v.prepay === 'number' ? Math.round(v.prepay * 100) + '%' : v.prepay || ''); row('Quotation terms', v => v.notes || '');
  R.push([]); R.push(['EVALUATION (points)']);
  for (const g of groups()) { if (groups().length > 1) row(`${g.name} (weight ${gScore(vs[0], g).w})`, v => n1(gScore(v, g).score)); for (const c of gCrit(g)) row(`   ${c.name} (weight ${c.weight})`, v => { const r = crit(v, c); return r.pct == null ? 'Not rated' : n1(r.pct * c.weight); }); }
  row('Overall score / 100', v => n1(overall(v).score)); row('Rank (all rated vendors)', v => rk.includes(v.id) ? rk.indexOf(v.id) + 1 : '');
  const A = [['Category', 'Criterion', 'Sub-item', 'Criterion weight %', 'Max points', ...S.vendors.map(v => v.name)]];
  for (const g of groups()) for (const c of gCrit(g)) for (const x of c.subs) A.push([g.name, c.name, x.name, c.weight, x.max, ...S.vendors.map(v => (S.scores[v.id] || {})[x.id] ?? '')]);
  A.push([]); A.push(['', '', 'Overall score / 100', '', '', ...S.vendors.map(v => n1(overall(v).score))]);
  const M = [['Vendor', 'Type', 'Name', 'Source', 'Link']]; for (const v of vs) for (const m of v.media) { const u = m.link || orig(m); M.push([v.name, m.kind === 'image' ? 'Image' : m.kind === 'link' ? 'Document' : 'Video', m.label, m.source, u && !/^blob:/.test(u) ? new URL(u, location.href).href : '']); }
  const wb = XLSX.utils.book_new(), sh = (name, aoa, w) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = w.map(x => ({ wch: x })); XLSX.utils.book_append_sheet(wb, ws, name); };
  sh('Comparison', R, [34, ...vs.map(() => 38)]); sh('Scores', A, [34, 36, 40, 16, 11, ...S.vendors.map(() => 18)]); if (scen.show) sh('Scenario', SC, [26, 30, 8, 12, 16, 13, 17, 18, 9]); sh('Reference media', M, [26, 10, 44, 18, 80]);
  sh('Vendor directory', [['Company', 'Vendor (short name)', 'Location', 'Contact person', 'Email', 'WeChat / other', 'Key notes', 'Quotation', 'Currency', 'Price', 'Overall score'], ...S.vendors.map(v => [v.company || v.name, v.name, v.location || '', v.contact || '', v.email || '', v.wechat || '', knList(v).map(x => '• ' + x).join('\n'), v.quote || '', v.currency || '', v.price ?? '', n1(overall(v).score)])], [30, 24, 18, 22, 28, 24, 90, 30, 9, 11, 12]);
  XLSX.writeFile(wb, `Ghana-vendor-comparison-${new Date().toISOString().slice(0, 10)}.xlsx`); return { R, A, M, SC };
}
// Compare selection: remembered per browser; first visit (or nothing selected) opens on the project's default vendors.
const SELKEY = 'mmhub.sel.v1', selDefault = () => new Set(((window.SEED || {}).defaultCompare || []).filter(id => vById(id)));
function selLoad() { try { const a = JSON.parse(localStorage.getItem(SELKEY) || '[]').filter(id => vById(id)); if (a.length) return new Set(a.slice(0, 4)); } catch (_) {} return selDefault(); }
const selSave = () => { try { localStorage.setItem(SELKEY, JSON.stringify([...ui.sel])); } catch (_) {} };
function cmpVendors() { return S.vendors.filter(v => ui.sel.has(v.id)).slice(0, 4).sort(scoreOrder); } // highest score first
function renderCompare() { selSave();
  const vs = cmpVendors(), el = $('#compare');
  const head = `<div class="sec-head"><div><h2>Compare Vendors</h2><p class="lead">Select 2–4 vendors in the gallery. Previews are 16:9, never cropped.</p></div><div class="rowf"><button class="btn primary" data-act="export-pdf" ${vs.length < 2 ? 'disabled' : ''} title="Opens the print dialog – choose “Save as PDF”">Export PDF</button><button class="btn primary" data-act="export-xlsx" title="Comparison, all scores and media list as an Excel workbook">Export Excel</button><button class="btn" data-act="open-scores">Edit Scores &amp; Weights</button><a class="btn" href="#gallery">← Back to Gallery</a></div></div>`;
  if (vs.length < 2) { el.innerHTML = head + `<div class="empty">Tick <b>Compare</b> on at least two vendor cards, then click <b>Compare Selected</b>.<br><br><button class="btn" data-act="sel-top">Select the first three vendors</button></div>`; return; }
  el.innerHTML = head + `<div class="scenbar"><label><input type="checkbox" id="scenShow" ${scen.show ? 'checked' : ''}> <b>Show Quotation Planner scenario</b></label> <input id="scenName" class="scen-name" type="text" maxlength="80" placeholder="Scenario name, e.g. 4 min multimedia" value="${esc(scen.name)}" aria-label="Scenario name"><a class="btn sm" href="#quotation">Edit quantities in Quotation Planner</a><small class="mut">Adds scenario rows under Price, also in the PDF and Excel export. Published quotations are not changed.</small></div><div id="cmpWarn"></div><div class="cmp-scroll"><div class="cmp" style="--n:${vs.length}">
    <div class="crow head"><div class="lbl"></div>${vs.map(cmpHead).join('')}</div>
    <div id="cmpTop"></div>
    <div class="crow media"><div class="lbl">Portfolio Preview</div>${vs.map(v => `<div id="cp_${v.id}"></div>`).join('')}</div>
    <div id="cmpData"></div></div></div>`;
  vs.forEach(renderCmpPreview); renderCmpData();
}
function renderCmpPreview(v) {
  const el = $('#cp_' + v.id); if (!el) return;
  const vis = visuals(v), i = Math.min(ui.cidx[v.id] ?? Math.max(0, vis.findIndex(m => m.id === v.cover)), Math.max(0, vis.length - 1)), m = vis[i];
  el.innerHTML = `<div class="pv">${m ? player(m) + (m.kind === 'image' ? `<span class="tag">${esc(m.label)}</span>` : '') : '<div class="ph">No media available</div>'}
      ${vis.length > 1 ? `<button class="arrow l" data-act="cnav" data-v="${v.id}" data-d="-1" aria-label="Previous">‹</button><button class="arrow r" data-act="cnav" data-v="${v.id}" data-d="1" aria-label="Next">›</button>` : ''}</div>
    <div class="rowf" style="justify-content:space-between;margin-top:6px"><small>${m ? (i + 1) + ' / ' + vis.length + ' · ' + esc(m.kind === 'image' ? 'Image' : 'Video') + ' · ' + esc(m.label) : ''}</small>${m ? `<button class="btn sm" data-act="lb" data-v="${v.id}" data-m="${m.id}">Full screen</button>` : ''}</div>`;
}
function scenRows(vs, row, grp) {
  if (!scen.show) return '';
  const si = scenInfo(vs), of = v => si.all.find(x => x.v === v).s, was = (a, b, u) => a === b ? '' : ` <small class="was">was ${qNum(b)}${u}</small>`;
  return row('Scenario quantities', v => { const s = of(v), ls = s.lines.filter(l => (l.qty !== 0 || l.changed) && !/modell/i.test(l.label)); if (!s.priced) return '<span class="mut">—</span>';
      return `<ul class="items num">${ls.map(l => `<li class="${l.changed ? 'chg' : ''}"><span>${esc(l.label)} · ${qNum(l.qty)} ${esc(l.unit)}${was(l.qty, l.bQty, '')} × ${l.rate == null ? 'no rate' : qNum(l.rate)}${l.rate == null ? '' : was(l.rate, l.bRate, '')}</span><span>${l.line == null ? 'Pending' : money(l.line)}</span></li>`).join('')}</ul>`; }) +
    (scenAligned(vs) ? '' : `<div class="crow"><div class="lbl"></div><div style="grid-column:2/-1"><span class="pill warn">Quantities differ between these vendors</span> <span class="mut">Totals are not like-for-like. In Quotation Planner, click “Apply quantities to all vendors”.</span></div></div>`) +
    (si.edited ? '' : `<div class="crow"><div class="lbl"></div><div style="grid-column:2/-1"><span class="mut">No planner changes yet for these vendors – scenario totals equal the itemised quotations. Change quantities in Quotation Planner, then use “Apply quantities to all vendors”.</span></div></div>`);
}
function renderCmpData() {
  const vs = cmpVendors(), box = $('#cmpData'); if (!box) return;
  const pi = priceInfo(vs), rk = ranked(), row = (l, f, cls = '') => `<div class="crow ${cls}"><div class="lbl">${l}</div>${vs.map(v => `<div class="${v.rank === 1 ? 'best' : ''}">${f(v)}</div>`).join('')}</div>`;
  const grp = l => `<div class="crow grp"><div class="lbl">${l}</div></div>`, ns = '<span class="mut">Not stated</span>';
  $('#cmpWarn').innerHTML = (pi.same ? '' : '<div class="note" style="margin:0 0 12px"><b>Mixed currencies.</b> Prices are not converted without a verified exchange rate, so no lowest price is highlighted.</div>');
  const si = scen.show ? scenInfo(vs) : null, sOf = v => si.all.find(x => x.v === v).s;
  const price = v => { // scenario on: the scenario price replaces the quoted total
    if (!si) return `<div class="big num ${pi.same && v.price === pi.min ? 'low' : ''}">${money(v.price, v.currency)}</div>${pi.same && v.price === pi.min ? '<span class="pill good">Lowest quoted price</span>' : ''}`;
    const s = sOf(v); if (!s.priced) return `<div class="big num">${money(v.price, v.currency)}</div><span class="pill">Quotation – not itemised</span>`;
    const low = si.min != null && !s.missing && s.total === si.min;
    return `<div class="big num ${low ? 'low' : ''}">${money(s.total, v.currency)}</div>${s.missing ? `<span class="pill warn">Incomplete – ${s.missing} line(s) without a rate</span>` : (low ? '<span class="pill good">Lowest price</span>' : '')}`; };
  const score = v => `<div class="big">${scoreLabel(v)}</div>${rk.includes(v.id) ? `<small>Rank ${rk.indexOf(v.id) + 1} of ${rk.length} rated vendors</small>` : ''}${groups().length > 1 && overall(v).score != null ? `<div class="gchips">${groups().map(g => { const r = gScore(v, g); return `<span><b class="num">${r.score == null ? '–' : fx1(r.score)}</b> / ${r.w}<small>${esc(g.name.replace(/^([A-Z])[\s.·:–-]+/, '$1 · '))}</small></span>`; }).join('')}</div>` : ''}`;
  const discount = v => { const d = disc(v); if (!d) return '<span class="mut">No discount stated</span>'; const s = si ? sOf(v) : null, now = s && s.priced && !s.missing ? s.total : v.price; // percentage is the vendor's reduction on its quotation; the price stated is the one shown in the Price row
    return `<span class="pill good">${fx1(d.pct)}% discount offered on the initial quotation</span><br><span class="num">Price now <b>${money(now, v.currency)}</b></span>`; };
  $('#cmpTop').innerHTML = grp('Summary' + (si ? ` · ${esc(scenTitle())} <small>price = scenario quantities × each vendor’s quoted unit rates</small>` : '')) + row('<b>Overall Score</b>', score) + row(si ? '<b>Price</b><br><small>' + esc(scenTitle()) + '</small>' : '<b>Total Quotation</b>', price);
  box.innerHTML = grp('Price details') +
    scenRows(vs, row, grp) +
    row('Deliverables', v => esc(v.deliverables) || ns) +
    row('Unit Price', v => v.items && v.items.length ? `<ul class="items num">${v.items.map(it => `<li><span>${esc(it.label)}</span><span>${money(it.unit, v.currency)}${it.unitOrig != null && v.origCurrency && v.origCurrency !== v.currency ? ` <small>(${money(it.unitOrig, v.origCurrency)})</small>` : ''}</span></li>`).join('')}</ul>` : '<span class="mut">Not itemised</span>') +
    grp('Key notes') + row('Reviewer assessment', v => kn(v)) +
    grp('Delivery') + row('Timeline', v => esc(v.timeline) || ns) + row('Revision Rounds', v => esc(v.revisions) || ns) +
    row('Prepayment', v => v.prepay == null ? ns : typeof v.prepay === 'number' ? Math.round(v.prepay * 100) + '%' : esc(v.prepay)) +
    grp(`Evaluation ${S.scoringNote ? '(' + esc(S.scoringNote) + ' – editable)' : S.scoringSource === 'excel' ? '(criteria &amp; scores from workbook – editable)' : '(default criteria – editable)'}`) +
    groups().map(g => (groups().length > 1 ? row(`<b>${esc(g.name)}</b><br><small>Weight ${gScore(vs[0], g).w}%</small>`, v => { const r = gScore(v, g); return r.score == null ? '<span class="pill warn">Not Rated</span>' : `<b class="num">${fx1(r.score)}</b> / ${r.w}`; }, 'sub') : '') +
      gCrit(g).map(c => row(`${esc(c.name)}<br><small>Weight ${c.weight}%</small>`, v => { const r = crit(v, c); return r.pct == null ? '<span class="pill warn">Not Rated</span>' : `<span class="num"><b>${fx1(r.got)}</b> / ${r.max}</span>${r.rated < r.total ? ' <span class="pill warn">partly rated</span>' : ''}<div class="meter"><i style="width:${Math.round(r.pct * 100)}%"></i></div>`; })).join('')).join('') +
    row('<b>Overall Score</b>', v => `<div class="big">${scoreLabel(v)}</div>${rk.includes(v.id) ? `<small>Rank ${rk.indexOf(v.id) + 1} of ${rk.length} rated vendors</small>` : ''}`) +
    (weightsOk() ? '' : `<div class="crow"><div class="lbl"></div><div style="grid-column:2/-1"><span class="pill warn">Weights total ${wsum()}% – must equal 100%. Overall scores are provisional.</span></div></div>`);
}

/* ---------- modals ---------- */
function scoreSummary() {
  const rk = ranked();
  return `<table><thead><tr><th>Vendor</th>${S.vendors.map(v => `<th class="c">${esc(v.name)}</th>`).join('')}</tr></thead><tbody>
    <tr><td>Overall score</td>${S.vendors.map(v => `<td class="c"><b>${scoreLabel(v)}</b></td>`).join('')}</tr>
    <tr><td>Rank</td>${S.vendors.map(v => `<td class="c">${rk.includes(v.id) ? rk.indexOf(v.id) + 1 : '—'}</td>`).join('')}</tr></tbody></table>
    <div class="note ${weightsOk() ? 'info' : ''}" style="margin-top:10px">${weightsOk() ? 'Weights total 100%.' : `<b>Weights total ${wsum()}%.</b> They must total 100% – adjust the weights below.`} Overall Score = Σ (criterion points ÷ criterion max × weight). Empty score = “Not Rated” (never counted as zero) and makes the result provisional.</div>`;
}
function modalScores() {
  return `<div class="ov" data-act="close-ov"><div class="dlg"><div class="dhead"><div><h2>Edit Scores &amp; Weights</h2><small>${esc(S.project.scoringTitle || '')}</small></div><span class="rowf"><button class="btn" data-act="export-xlsx">Export scores (Excel)</button><button class="btn primary" data-act="close">Done</button></span></div>
    <div class="panel" id="scoreSummary">${scoreSummary()}</div>
    <p class="mut" style="margin:12px 2px 0">Every score, weight and max is editable – click a cell and type. Use the small A/B/C selector to move a criterion to another category.</p>
    <div class="panel tblw scoretbl"><table><thead><tr><th style="min-width:280px">Criterion / sub-item</th><th>Weight %</th><th>Max</th>${S.vendors.map(v => `<th class="c">${esc(v.name)}</th>`).join('')}</tr></thead><tbody>
    ${groups().map(g => (groups().length > 1 ? `<tr class="grp"><td colspan="3">${esc(g.name)}</td>${S.vendors.map(v => `<td class="c num" data-gs="${g.id}|${v.id}"></td>`).join('')}</tr>` : '') + gCrit(g).map(c => `<tr class="crit"><td>${esc(c.name)}${groups().length > 1 ? ` <select class="gsel" data-g="${c.id}" aria-label="Category of ${esc(c.name)}">${groups().map(x => `<option value="${x.id}" ${x.id === g.id ? 'selected' : ''}>${esc(x.name.split(' · ')[0])}</option>`).join('')}</select>` : ''}<details><summary>What it measures</summary>${esc(c.desc)}</details></td><td><input class="wt" type="number" min="0" max="100" step="1" value="${c.weight}" data-w="${c.id}" aria-label="Weight ${esc(c.name)}"></td><td data-cm="${c.id}">${c.subs.reduce((a, s) => a + s.max, 0)}</td>${S.vendors.map(v => `<td class="c num" data-cs="${c.id}|${v.id}"></td>`).join('')}</tr>` +
      c.subs.map(s => `<tr><td>${esc(s.name)}<details><summary>Scoring guide</summary>${esc(s.check)}${s.tiers && s.tiers.some(Boolean) ? `<br>100%: ${esc(s.tiers[0])} · 50%: ${esc(s.tiers[1])} · 30%: ${esc(s.tiers[2])} · 0: ${esc(s.tiers[3])}` : ''}${s.rationale ? '<br><br>' + esc(s.rationale) : ''}</details></td><td></td><td><input class="wt" type="number" min="0.5" step="0.5" value="${s.max}" data-mx="${s.id}" aria-label="Max points ${esc(s.name)}"></td>${S.vendors.map(v => { const x = (S.scores[v.id] || {})[s.id]; return `<td class="c"><input class="sc ${x == null ? 'nr' : ''}" type="number" min="${s.min || 0}" max="${s.max}" step="0.5" value="${x == null ? '' : x}" placeholder="NR" data-s="${s.id}" data-v="${v.id}" aria-label="${esc(s.name)} – ${esc(v.name)}"></td>`; }).join('')}</tr>`).join('')).join('')).join('')}
    </tbody></table></div></div></div>`;
}
function fillCritCells() { document.querySelectorAll('[data-cs]').forEach(td => { const [c, v] = td.dataset.cs.split('|'), r = crit(vById(v), S.criteria.find(x => x.id === c)); td.textContent = r.pct == null ? 'Not Rated' : fx1(r.got) + ' / ' + r.max; });
  document.querySelectorAll('[data-gs]').forEach(td => { const [g, v] = td.dataset.gs.split('|'), r = gScore(vById(v), groups().find(x => x.id === g)); td.textContent = r.score == null ? 'Not Rated' : fx1(r.score) + ' / ' + r.w; });
  document.querySelectorAll('[data-cm]').forEach(td => { td.textContent = S.criteria.find(x => x.id === td.dataset.cm).subs.reduce((a, s) => a + s.max, 0); }); }
const vSelect = (id, cur) => `<select id="${id}">${S.vendors.map(v => `<option value="${v.id}" ${v.id === cur ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>`;
function mediaItem(m, v) {
  return `<div class="mitem"><div class="pv">${m.kind === 'image' ? `<img src="${esc(src(m))}" alt="" loading="lazy">` : `<div class="ph">${m.kind === 'link' ? '↗ Link / document' : '▶ Video'}</div>`}</div>
    <div class="mi"><input type="text" value="${esc(m.label)}" data-ml="${m.id}" aria-label="Name" title="Rename"><span class="mut">${esc(m.source)}${v && v.cover === m.id ? ' · Cover' : ''}</span>
    <div class="rowf">${v ? `${m.kind === 'image' ? `<button class="btn sm" data-act="cover" data-v="${v.id}" data-m="${m.id}">Set cover</button>` : ''}<label class="btn sm">Replace<input type="file" hidden accept="image/*,video/*" data-replace="${m.id}" data-v="${v.id}"></label><button class="btn sm" data-act="rm" data-v="${v.id}" data-m="${m.id}">Remove</button>`
      : `<select data-assign="${m.id}"><option value="">Assign to vendor…</option>${S.vendors.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>`}
      <a class="btn sm" href="${esc(orig(m))}" target="_blank" rel="noopener">Open</a></div></div></div>`;
}
function modalVendor(v) {
  const f = (k, l, type = 'text') => `<label for="f_${k}">${l}</label><input id="f_${k}" type="${type}" ${type === 'number' ? 'step="any"' : ''} value="${esc(v[k] ?? '')}" data-f="${k}" data-v="${v.id}">`;
  return `<div class="ov" data-act="close-ov"><div class="dlg narrow"><div class="dhead"><h2>Edit vendor</h2><span class="rowf"><button class="btn" data-act="del-vendor" data-v="${v.id}">Delete vendor</button><button class="btn primary" data-act="close">Done</button></span></div>
    <div class="panel"><div class="frm">${f('name', 'Vendor name')}${f('price', 'Price (total)', 'number')}${f('currency', 'Currency')}${f('deliverables', 'Deliverables')}${f('timeline', 'Timeline')}${f('revisions', 'Revision rounds')}${f('rank', 'Recommendation rank', 'number')}${f('recNote', 'Recommendation note')}
      <label for="f_keynotes">Key notes<br><small>one point per line</small></label><textarea id="f_keynotes" style="min-height:150px" data-f="keynotes" data-v="${v.id}">${esc(v.keynotes || '')}</textarea>
      <label for="f_notes">Quotation terms</label><textarea id="f_notes" data-f="notes" data-v="${v.id}">${esc(v.notes)}</textarea></div>
      <h3 style="margin-top:14px">Directory details</h3><div class="frm">${f('company', 'Company (full name)')}${f('location', 'Location')}${f('contact', 'Contact person')}${f('email', 'Email')}${f('wechat', 'WeChat / other contact')}</div>
      <small>Edits are saved in this browser only; the source Excel file is never modified.</small></div>
    <div class="panel"><h3>Add portfolio media</h3><div class="rowf"><label class="btn sm primary">Add images / videos<input type="file" hidden multiple accept="image/*,video/*" data-add="${v.id}"></label>
      <input type="url" id="newUrl" placeholder="Video URL (YouTube, Drive, Vimeo, .mp4…)" style="flex:1;min-width:240px"><button class="btn sm" data-act="add-url" data-v="${v.id}">Add link</button></div></div>
    <div class="panel"><h3>Media (${v.media.length})</h3><div class="mlist">${v.media.map(m => mediaItem(m, v)).join('') || '<span class="mut">No media yet.</span>'}</div></div></div></div>`;
}
function modalImport() {
  return `<div class="ov" data-act="close-ov"><div class="dlg narrow"><div class="dhead"><h2>Import / Update Data</h2><button class="btn" data-act="close">Done</button></div>
    <div class="panel"><h3>1 · Excel workbook (.xlsx / .xls)</h3><p class="mut" style="margin:0 0 8px">Reads vendor quotes, scoring criteria and embedded images (embedded images require .xlsx). Replaces the current quotation data; media you added yourself is kept for vendors with the same name. The file is read in the browser and never uploaded.</p>
      <label class="btn primary">Choose workbook<input type="file" hidden accept=".xlsx,.xls" id="xlsFile"></label> <span id="xlsMsg" class="mut"></span></div>
    <div class="panel"><h3>2 · Portfolio media</h3><div class="rowf"><label for="impV" class="mut">Vendor</label>${vSelect('impV')}
      <label class="btn sm">Images / videos<input type="file" hidden multiple accept="image/*,video/*" id="impFiles"></label>
      <label class="btn sm">Select folder<input type="file" hidden webkitdirectory multiple id="impDir"></label></div>
      <div class="rowf" style="margin-top:8px"><input type="url" id="impUrl" placeholder="Video URL" style="flex:1;min-width:240px"><button class="btn sm" data-act="imp-url">Add link</button></div>
      <p class="mut" id="impMsg" style="margin:8px 0 0">Files are copied into this browser's local storage (IndexedDB) so they persist after refresh. Originals are untouched.</p></div>
    ${(S.unassigned || []).length ? `<div class="panel"><h3>3 · Needs manual confirmation (${S.unassigned.length})</h3><p class="mut" style="margin:0 0 8px">Found in the workbook without a vendor header – assign or leave unassigned.</p><div class="mlist">${S.unassigned.map(m => mediaItem(m)).join('')}</div></div>` : ''}
    <div class="panel"><h3>Reset</h3><div class="rowf"><button class="btn sm" data-act="reset">Discard local edits &amp; reload project data</button><span class="mut">Restores the data built from the project workbook.</span></div></div></div></div>`;
}
function renderModal() {
  const m = ui.modal;
  $('#modal').innerHTML = !m ? '' : m.type === 'scores' ? modalScores() : m.type === 'vendor' ? modalVendor(vById(m.v)) : modalImport();
  if (m && m.type === 'scores') fillCritCells();
  document.body.style.overflow = m || ui.lb ? 'hidden' : '';
}
function renderLb() {
  const l = ui.lb, el = $('#lightbox');
  if (!l) { el.innerHTML = ''; document.body.style.overflow = ui.modal ? 'hidden' : ''; return; }
  const v = vById(l.v), list = visuals(v), i = Math.max(0, list.findIndex(m => m.id === l.m)), m = list[i];
  el.innerHTML = `<div class="lb" role="dialog" aria-label="Media viewer"><div class="lbtop"><span><b>${esc(v.name)}</b> · ${esc(m.label)} · ${esc(m.source)} · ${i + 1} / ${list.length}</span>
    <span class="rowf"><a href="${esc(orig(m))}" target="_blank" rel="noopener">Open original ↗</a>${m.link ? `<a href="${esc(m.link)}" target="_blank" rel="noopener">Online link ↗</a>` : ''}<button class="btn sm" data-act="lb-close">Close ✕</button></span></div>
    <div class="lbmain">${player(m, true)}${list.length > 1 ? `<button class="arrow l" data-act="lb-nav" data-d="-1" aria-label="Previous">‹</button><button class="arrow r" data-act="lb-nav" data-d="1" aria-label="Next">›</button>` : ''}</div></div>`;
  document.body.style.overflow = 'hidden';
}
function renderAll() { renderOverview(); renderGallery(); renderVideos(); renderCompare(); renderDirectory(); renderQuotation(); renderModal(); }
const refreshData = () => { renderOverview(); renderGallery(); renderCmpData(); renderDirectory(); };

/* ---------- actions ---------- */
async function addFiles(v, files, source = 'User') {
  let n = 0;
  for (const f of files) {
    const kind = f.type.startsWith('image/') || P.IMG.test(f.name) ? 'image' : f.type.startsWith('video/') || P.VID.test(f.name) ? 'video' : null; if (!kind) continue;
    const id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await blobPut(id, f); blobUrls[id] = URL.createObjectURL(f);
    v.media.push({ id: 'u' + id, kind, blobId: id, label: f.webkitRelativePath || f.name, source }); n++;
  }
  if (!v.cover) { const c = images(v)[0]; if (c) v.cover = c.id; }
  save(); return n;
}
function addUrl(v, u) {
  u = (u || '').trim(); if (!/^https?:\/\//i.test(u)) { alert('Enter a full http(s) URL.'); return false; }
  const c = P.classifyUrl(u); v.media.push({ id: 'u' + Date.now().toString(36), kind: c.kind, src: c.src, orig: u, label: u.replace(/^https?:\/\//, '').slice(0, 60), source: 'User' }); save(); return true;
}
async function importExcel(file) {
  const p = await P.parseWorkbook(await file.arrayBuffer(), XLSX, JSZip);
  if (!p.vendors.length) throw new Error('No vendor table found (expected a “Vendor” header column with prices).');
  const st = P.toState(p);
  for (const m of allMedia(st)) if (m.zipPath) { const id = 'x' + Date.now().toString(36) + m.id, blob = new Blob([await p.getBytes(m.zipPath)], { type: P.mime(m.zipPath) }); await blobPut(id, blob); blobUrls[id] = URL.createObjectURL(blob); m.blobId = id; delete m.zipPath; }
  for (const v of st.vendors) { const old = S.vendors.find(o => P.sameVendor(o.name, v.name)); if (old) v.media.push(...old.media.filter(m => m.source !== 'Excel')); const c = v.media.find(m => m.kind === 'image' && !m.doc); v.cover = c ? c.id : null; }
  st.importedFrom = file.name; S = st; ui.sel = new Set(); save(); await gc();
  return st;
}
const ACT = {
  'q-export': qDownload,
  'q-reset': (d, e) => { if (!sure(e)) return; delete qDrafts[qVendor]; qPersist(); renderQuotation(); renderCmpData(); },
  'q-reset-all': (d, e) => { if (!sure(e)) return; qDrafts = {}; qPersist(); renderQuotation(); renderCmpData(); },
  'q-apply-all': () => { const v = qSource(), from = qRows(v), others = S.vendors.filter(x => x.id !== v.id);
    for (const o of others) { const rows = clone(qRows(qSrc(o))); for (const r of rows) { const m = from.find(x => x.label === r.label && x.unit === r.unit); if (m && r.unit !== 'lot') r.qty = m.qty; } qDrafts[o.id] = { rows, saved: new Date().toISOString() }; }
    qPersist(); scen.applied = { from: v.name, at: new Date().toISOString() }; goCompare(); },
  'q-compare': () => goCompare(),
  'open-import': () => { ui.modal = { type: 'import' }; renderModal(); },
  'open-scores': () => { ui.modal = { type: 'scores' }; renderModal(); },
  'open-vendor': d => { ui.modal = { type: 'vendor', v: d.v }; renderModal(); },
  close: () => { ui.modal = null; renderAll(); },
  'export-pdf': async () => { if (cmpVendors().length < 2) return; await buildPrint(); window.print(); },
  'export-xlsx': () => { exportXlsx(); },
  dir: () => { ui.dir = ui.dir === 'asc' ? 'desc' : 'asc'; renderGallery(); renderVideos(); renderDirectory(); },
  vv: d => { ui.vv = d.v; ui.vm = null; renderVideos(); },
  vm: d => { ui.vm = d.m; renderVideos(); },
  'add-vendor': () => { const id = 'n' + Date.now().toString(36); S.vendors.push({ id, name: 'New vendor', quote: 'Added manually', currency: (S.project || {}).currency || 'SGD', price: null, items: [], notes: '', timeline: '', revisions: '', caveats: '', deliverables: '', media: [], cover: null }); S.scores[id] = {}; save(); ui.modal = { type: 'vendor', v: id }; renderAll(); },
  'del-vendor': async d => { const v = vById(d.v); if (!confirm(`Delete “${v.name}” from the dashboard, including its scores and media list? Source files are not deleted.`)) return; S.vendors = S.vendors.filter(x => x.id !== d.v); delete S.scores[d.v]; ui.sel.delete(d.v); ui.modal = null; save(); await gc(); renderAll(); },
  'close-ov': (d, e) => { if (e.target.classList.contains('ov')) ACT.close(); },
  pick: d => { ui.idx[d.v] = +d.i; renderGallery(); },
  'go-compare': () => { renderCompare(); location.hash = '#compare'; $('#compare').scrollIntoView(); },
  'clear-sel': () => { ui.sel.clear(); renderGallery(); renderCompare(); },
  'sel-top': () => { ui.sel = new Set(S.vendors.slice(0, 3).map(v => v.id)); renderGallery(); renderCompare(); },
  cnav: d => { const v = vById(d.v), n = visuals(v).length, cur = ui.cidx[d.v] ?? Math.max(0, visuals(v).findIndex(m => m.id === v.cover)); ui.cidx[d.v] = (cur + +d.d + n) % n; renderCmpPreview(v); },
  lb: d => { ui.lb = { v: d.v, m: d.m }; renderLb(); },
  'lb-close': () => { ui.lb = null; renderLb(); },
  'lb-nav': d => { const list = visuals(vById(ui.lb.v)), i = list.findIndex(m => m.id === ui.lb.m); ui.lb.m = list[(i + +d.d + list.length) % list.length].id; renderLb(); },
  cover: d => { vById(d.v).cover = d.m; delete ui.idx[d.v]; delete ui.cidx[d.v]; save(); renderAll(); },
  rm: async d => { const v = vById(d.v); if (!confirm('Remove this item from the dashboard? The original file is not deleted.')) return; v.media = v.media.filter(m => m.id !== d.m); if (v.cover === d.m) v.cover = (images(v)[0] || {}).id || null; save(); await gc(); renderAll(); },
  'add-url': d => { if (addUrl(vById(d.v), $('#newUrl').value)) renderAll(); },
  'imp-url': () => { if (addUrl(vById($('#impV').value), $('#impUrl').value)) { renderAll(); $('#impMsg').textContent = 'Link added.'; } },
  reset: async () => { if (!confirm('Discard all local edits, scores and imported media, and reload the project data?')) return; localStorage.removeItem(LS); S = clone(window.SEED || DEMO()); ui.sel = selDefault(); ui.idx = {}; ui.cidx = {}; await gc(); renderAll(); },
};
document.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (!t || t.tagName === 'SELECT' || t.type === 'checkbox') return; const f = ACT[t.dataset.act]; if (f) f(t.dataset, e); });
document.addEventListener('focusin', e => { const t = e.target; if (t.matches && t.matches('input.sc, input.wt')) t.select(); }); // typing replaces the old value instead of appending to it
document.addEventListener('keydown', e => { if (ui.lb) { if (e.key === 'Escape') ACT['lb-close'](); if (e.key === 'ArrowRight') ACT['lb-nav']({ d: 1 }); if (e.key === 'ArrowLeft') ACT['lb-nav']({ d: -1 }); } else if (ui.modal && e.key === 'Escape') ACT.close(); });
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.s) { const raw = t.value.trim(), sub = S.criteria.flatMap(c => c.subs).find(s => s.id === t.dataset.s); let x = raw === '' || isNaN(+raw) ? null : Math.max(sub.min || 0, Math.min(sub.max, +raw)); (S.scores[t.dataset.v] = S.scores[t.dataset.v] || {})[t.dataset.s] = x; t.classList.toggle('nr', x == null); }
  else if (t.dataset.w) { S.criteria.find(c => c.id === t.dataset.w).weight = +t.value || 0; }
  else if (t.dataset.mx) { const sub = S.criteria.flatMap(c => c.subs).find(s => s.id === t.dataset.mx), mx = +t.value; if (!(mx > 0)) return; sub.max = mx; for (const k in S.scores) { const x = S.scores[k][sub.id]; if (x != null && x > mx) S.scores[k][sub.id] = mx; } document.querySelectorAll(`[data-s="${sub.id}"]`).forEach(i => { i.max = mx; const x = (S.scores[i.dataset.v] || {})[sub.id]; i.value = x == null ? '' : x; }); }
  else return;
  save(); $('#scoreSummary').innerHTML = scoreSummary(); fillCritCells(); refreshData();
});
document.addEventListener('change', async e => {
  const t = e.target;
  try {
    if (t.dataset.act === 'sort') { ui.sort = t.value; ui.dir = t.value === 'score' ? 'desc' : 'asc'; renderGallery(); renderVideos(); renderDirectory(); }
    else if (t.dataset.g) { S.criteria.find(c => c.id === t.dataset.g).group = t.value; save(); renderModal(); refreshData(); }
    else if (t.dataset.ml) { const m = mById(t.dataset.ml); if (m && t.value.trim()) { m.label = t.value.trim(); save(); renderGallery(); renderVideos(); renderCompare(); } }
    else if (t.dataset.act === 'sel') { t.checked ? ui.sel.add(t.dataset.v) : ui.sel.delete(t.dataset.v); renderGallery(); renderCompare(); }
    else if (t.dataset.s) { const x = (S.scores[t.dataset.v] || {})[t.dataset.s]; t.value = x == null ? '' : x; }
    else if (t.dataset.f) { const v = vById(t.dataset.v); v[t.dataset.f] = t.type === 'number' ? (t.value === '' ? null : +t.value) : t.value; save(); refreshData(); renderCompare(); }
    else if (t.dataset.add) { await addFiles(vById(t.dataset.add), t.files); renderAll(); }
    else if (t.dataset.replace) { const v = vById(t.dataset.v), f = t.files[0]; if (!f) return; const before = v.media.length; if (await addFiles(v, [f])) { const neu = v.media.pop(), i = v.media.findIndex(m => m.id === t.dataset.replace); if (v.cover === t.dataset.replace) v.cover = neu.kind === 'image' ? neu.id : null; v.media.splice(i, 1, neu); save(); await gc(); } renderAll(); }
    else if (t.dataset.assign) { const v = vById(t.value), i = S.unassigned.findIndex(m => m.id === t.dataset.assign); if (!v || i < 0) return; const m = S.unassigned.splice(i, 1)[0]; m.source += ' (manually assigned)'; v.media.push(m); if (!v.cover && m.kind === 'image') v.cover = m.id; save(); renderAll(); }
    else if (t.id === 'xlsFile' && t.files[0]) { $('#xlsMsg').textContent = 'Reading…'; const st = await importExcel(t.files[0]); renderAll(); $('#xlsMsg').textContent = `Imported ${st.vendors.length} vendors, ${allMedia(st).filter(m => m.blobId).length} embedded images.`; }
    else if (t.id === 'impFiles' || t.id === 'impDir') { const n = await addFiles(vById($('#impV').value), t.files); const name = vById($('#impV').value).name; renderAll(); $('#impMsg').textContent = `${n} file(s) added to ${name}.`; }
  } catch (err) { console.error(err); alert('Import failed: ' + err.message); }
});

/* ---------- boot ---------- */
(async () => {
  try { S = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { S = null; }
  if (!S || !S.vendors) S = clone(window.SEED || DEMO());
  else if (window.SEED && !S.importedFrom && S.source && S.source.rev !== window.SEED.source.rev) {
    // seed was rebuilt: refresh project media/names, keep the user's edits, scores and own uploads
    const mine = m => m.source === 'User' || /manually assigned/.test(m.source);
    for (const sv of window.SEED.vendors) { const v = S.vendors.find(x => x.id === sv.id); if (!v) { S.vendors.push(clone(sv)); S.scores[sv.id] = clone(window.SEED.scores[sv.id] || {}); continue; } v.media = [...clone(sv.media), ...v.media.filter(mine)]; if (!v.media.some(m => m.id === v.cover)) v.cover = sv.cover; }
    S.source = clone(window.SEED.source); save();
  }
  if (window.SEED && !S.importedFrom) for (const sv of window.SEED.vendors) { const v = S.vendors.find(x => x.id === sv.id); if (v) for (const k of ['videoQuality', 'keynotes', 'company', 'location', 'contact', 'email', 'wechat']) if (v[k] === undefined) v[k] = sv[k]; } // fields added after this browser saved its state
  if (window.SEED && !S.importedFrom) for (const sv of window.SEED.vendors) { const v = vById(sv.id); if (v && sv.featuredRevision && v.featuredRevision !== sv.featuredRevision) { v.cover = sv.cover; v.featuredRevision = sv.featuredRevision; save(); } }
  // Apply the reviewer's explicit criterion correction once; retain unrelated scores and drafts.
  if (window.SEED?.scoreCorrection && !S.importedFrom && S.appliedScoreCorrection !== window.SEED.scoreCorrection.id) {
    const c = window.SEED.scoreCorrection;
    for (const [id, scores] of Object.entries(c.scores)) if (vById(id)) Object.assign(S.scores[id] = S.scores[id] || {}, scores);
    S.appliedScoreCorrection = c.id; S.scoringNote = window.SEED.scoringNote; save();
  }
  // Migrate only the exact superseded copy; keep custom notes, scores, prices and planner drafts.
  if (window.SEED?.textCorrections && !S.importedFrom) {
    const c = window.SEED.textCorrections;
    if (S.project?.scope === c.previousScope) S.project.scope = c.scope;
    const icon = S.vendors.find(v => v.id === c.iconId);
    if (icon?.keynotes) icon.keynotes = icon.keynotes.split('\n').map(line => line === c.previousIconCommercial ? c.iconCommercial : line).join('\n');
    save();
  }
  try { const need = new Set(allMedia().map(m => m.blobId).filter(Boolean)); for (const k of need) { const b = await blobGet(k); if (b) blobUrls[k] = URL.createObjectURL(b); } } catch (e) { console.warn('IndexedDB unavailable', e); }
  const q = new URLSearchParams(location.search), pre = (q.get('compare') || '').split(',').filter(id => vById(id)); // ?compare=id,id preselects vendors
  if (pre.length) ui.sel = new Set(pre.slice(0, 4)); else ui.sel = selLoad();
  webify(); renderAll();
  if (q.get('print') && pre.length > 1) buildPrint();
})();
// Hide the floating selection bar while Compare is on screen, so it never sits on top of a screenshot of the table.
if ('IntersectionObserver' in window) new IntersectionObserver(es => { const b = $('#selbar'); if (b) b.style.display = es[0].isIntersecting && es[0].intersectionRect.height > innerHeight * 0.5 ? 'none' : ''; }, { threshold: [0, 0.05, 0.1, 0.2, 0.4, 0.6, 0.8, 1] }).observe($('#compare'));
