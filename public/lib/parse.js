/* Multimedia Hub – workbook parser. Shared by the browser (Excel import) and tools/build-seed.js (Node).
   Reads vendor quotes, scoring criteria, embedded images (floating + in-cell) and video links. Never invents values. */
(function (root) {
  const S = v => (v == null ? '' : String(v).trim());
  const norm = s => S(s).toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
  const sameVendor = (a, b) => { a = norm(a); b = norm(b); return !!a && !!b && (a.startsWith(b) || b.startsWith(a)); };
  const VID = /\.(mp4|mov|webm|m4v)$/i, IMG = /\.(jpe?g|png|webp|gif)$/i;
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/mp4' };
  const mime = p => MIME[S(p).split('.').pop().toLowerCase()] || 'application/octet-stream';
  const col = (hdr, re) => (hdr || []).findIndex(c => re.test(S(c)));
  const num = v => (typeof v === 'number' && isFinite(v) ? v : null);

  function classifyUrl(u) {
    let m;
    if ((m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/.exec(u))) return { kind: 'embed', src: 'https://www.youtube-nocookie.com/embed/' + m[1] };
    if ((m = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(u))) return { kind: 'embed', src: 'https://drive.google.com/file/d/' + m[1] + '/preview' };
    if ((m = /vimeo\.com\/(\d+)/.exec(u))) return { kind: 'embed', src: 'https://player.vimeo.com/video/' + m[1] };
    const bare = u.split(/[?#]/)[0];
    if (VID.test(bare)) return { kind: 'video', src: u };
    if (IMG.test(bare)) return { kind: 'image', src: u };
    return { kind: 'link', src: u };
  }

  function parseMatrix(sh, out) {
    const rows = sh.rows, i = sh.hdr, h = rows[i];
    const c = { quote: col(h, /^quote$/i), model: col(h, /^modelling/i), totalEx: col(h, /total excl/i), anim15: col(h, /15-s/i), net: col(h, /net grand/i), prepay: col(h, /prepay/i), notes: col(h, /key notes/i), gross: col(h, /before discount/i), vs: col(h, /vs lowest/i) };
    const itemCols = []; h.forEach((x, k) => { if (/\/\s*(img|min|sec)/i.test(S(x))) itemCols.push(k); });
    let r = i + 1, qty = null;
    if (/qty/i.test(S((rows[r] || [])[0]))) { qty = rows[r]; r++; }
    for (; r < rows.length; r++) {
      const row = rows[r] || [], name = S(row[0]);
      if (!name || /^Δ/.test(name)) break;
      out.vendors.push({
        name, quote: S(row[c.quote]), currency: out.project.currency, price: num(row[c.net]), gross: num(row[c.gross]),
        totalEx: num(row[c.totalEx]), anim15: num(row[c.anim15]), modelling: row[c.model] == null ? null : row[c.model],
        prepay: row[c.prepay] == null ? null : row[c.prepay], notes: S(row[c.notes]), vsLowest: num(row[c.vs]),
        items: itemCols.map(k => ({ label: S(h[k]), qty: qty ? num(qty[k]) : null, unit: num(row[k]), unitOrig: null })),
      });
    }
    for (; r < rows.length && r < i + 14; r++) { const t = S((rows[r] || [])[0]); if (t.length > 80 && !/^Δ/.test(t)) out.project.notes = t; }
    const j = rows.findIndex(x => x && S(x[0]) === 'Vendor' && /^currency$/i.test(S(x[1])));
    if (j >= 0) {
      const h2 = rows[j], d = { fx: col(h2, /^fx/i), basis: col(h2, /fee basis/i), src: col(h2, /^source/i), doc: col(h2, /quote doc total/i), disc: col(h2, /^discount/i), model: col(h2, /^modelling/i) };
      for (let q = j + 1; q < rows.length; q++) {
        const row = rows[q] || [], name = S(row[0]); if (!name) break;
        const v = out.vendors.find(x => x.name === name); if (!v) continue;
        v.origCurrency = S(row[1]); v.fx = num(row[d.fx]); v.source = S(row[d.src]); v.docTotal = num(row[d.doc]);
        v.discount = num(row[d.disc]); v.modelBasis = S(row[d.basis]); v.modelOrig = num(row[d.model]);
        v.items.forEach(it => { const k = col(h2, new RegExp('^' + it.label.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') + '$')); if (k >= 0) it.unitOrig = num(row[k]); });
      }
    }
    const f = rows.findIndex(x => x && /^fx rates/i.test(S(x[0])));
    if (f >= 0) { out.project.fxNote = S(rows[f][2]) || S(rows[f][1]); out.project.fx = {}; for (let q = f + 1; q < rows.length && S((rows[q] || [])[0]); q++) out.project.fx[S(rows[q][0])] = num(rows[q][1]); }
  }

  function parseGeneric(sh, out) { // fallback: simple "one vendor per row" table
    const rows = sh.rows, h = rows[sh.hdr];
    const c = { v: col(h, /vendor|supplier|company/i), p: col(h, /total|price|quotation|amount|quote/i), cur: col(h, /currency/i), t: col(h, /timeline|delivery|duration|lead/i), s: col(h, /scope|deliverable/i), r: col(h, /revision/i), n: col(h, /note|remark/i) };
    sh.rowVendor = {};
    for (let r = sh.hdr + 1; r < rows.length; r++) {
      const row = rows[r] || [], name = S(row[c.v]); if (!name) continue;
      out.vendors.push({ name, quote: '', currency: S(row[c.cur]) || '', price: num(row[c.p]), items: [], notes: S(row[c.n]), timeline: S(row[c.t]), deliverables: S(row[c.s]), revisions: S(row[c.r]) });
      sh.rowVendor[r] = name;
    }
  }

  function parseScoring(sh, out) {
    const rows = sh.rows, h = rows[sh.hdr];
    const c = { sub: col(h, /sub-item/i), max: col(h, /max pts/i), chk: col(h, /what is checked/i), rat: col(h, /评分理由|rationale/i), ev: col(h, /evidence/i) };
    const vcols = out.vendors.map(v => ({ v, k: h.findIndex(x => S(x) === v.name) })).filter(x => x.k >= 0);
    let cur = null;
    for (let r = sh.hdr + 1; r < rows.length; r++) {
      const row = rows[r] || [], sub = S(row[c.sub]); if (!sub) break;
      if (S(row[0])) { cur = { name: S(row[0]), weight: (num(row[1]) || 0) * (num(row[1]) <= 1 ? 100 : 1), desc: S(row[2]), subs: [] }; out.criteria.push(cur); }
      if (!cur) continue;
      const s = { name: sub, max: num(row[c.max]) || 5, check: S(row[c.chk]), tiers: [1, 2, 3, 4].map(k => S(row[c.chk + k])), rationale: S(row[c.rat]), evidence: S(row[c.ev]), scores: {} };
      vcols.forEach(x => { s.scores[x.v.name] = num(row[x.k]); });
      cur.subs.push(s);
    }
  }

  async function parseWorkbook(buf, XLSX, JSZip) {
    const wb = XLSX.read(buf, { type: 'array' });
    const sheets = wb.SheetNames.map(n => ({ name: n, ws: wb.Sheets[n], rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true, range: 0 }) }));
    const out = { project: { title: '', scope: '', notes: '', currency: '' }, vendors: [], criteria: [], media: [], links: [] };
    let main = null;
    for (const sh of sheets) { const i = sh.rows.findIndex(r => r && S(r[0]) === 'Vendor' && r.some(c => /net grand total/i.test(S(c)))); if (i >= 0) { sh.hdr = i; main = sh; break; } }
    if (main) {
      out.project.title = S(main.rows[0] && main.rows[0][0]); out.project.scope = S(main.rows[1] && main.rows[1][0]);
      out.project.currency = (/\(([A-Z]{3})\)/.exec(out.project.title) || [])[1] || '';
      parseMatrix(main, out);
    } else {
      for (const sh of sheets) { const i = sh.rows.findIndex(r => r && r.some(c => /^(vendor|supplier)/i.test(S(c))) && r.some(c => /total|price|quot|amount/i.test(S(c)))); if (i >= 0) { sh.hdr = i; main = sh; parseGeneric(sh, out); break; } }
    }
    for (const sh of sheets) { const i = sh.rows.findIndex(r => r && /^criteria$/i.test(S(r[0])) && /weight/i.test(S(r[1]))); if (i >= 0) { sh.hdr2 = i; parseScoring({ rows: sh.rows, hdr: i }, out); out.project.scoringTitle = S(sh.rows[0] && sh.rows[0][0]); break; } }

    // reference block: header row "Deliverable | <vendor> ..." – vendor ownership by column span
    let refRow = -1, spans = [];
    if (main) {
      refRow = main.rows.findIndex(r => r && /^deliverable$/i.test(S(r[0])));
      if (refRow >= 0) {
        const h = main.rows[refRow], merges = main.ws['!merges'] || [];
        for (let k = 1; k < h.length; k++) if (S(h[k])) { const m = merges.find(x => x.s.r === refRow && x.s.c === k); spans.push({ name: S(h[k]), from: k, to: m ? m.e.c : k }); }
      }
    }
    const owner = (sh, r, c) => {
      if (sh === main && refRow >= 0 && r > refRow) { const sp = spans.find(x => c >= x.from && c <= x.to); return sp ? sp.name : null; }
      if (sh.rowVendor && sh.rowVendor[r]) return sh.rowVendor[r];
      return null;
    };
    if (main && refRow >= 0) {
      for (let r = refRow + 1; r < main.rows.length; r++) for (let c = 1; c < (main.rows[r] || []).length; c++) {
        const cell = main.ws[XLSX.utils.encode_cell({ r, c })]; if (!cell) continue;
        const text = cell.t === 's' ? S(cell.v) : '', url = (cell.l && cell.l.Target) || (/^https?:\/\//.test(text) ? text : '');
        if (url || VID.test(text)) out.links.push({ vendor: owner(main, r, c), title: text, url, label: S(main.rows[r][0]) });
      }
    }

    // embedded images
    const zip = await JSZip.loadAsync(buf);
    const txt = async p => (zip.file(p) ? zip.file(p).async('string') : '');
    const rels = async p => { const o = {}, t = await txt(p); for (const m of t.matchAll(/<Relationship\b[^>]*>/g)) { const a = k => (new RegExp(k + '="([^"]*)"').exec(m[0]) || [])[1]; o[a('Id')] = { target: a('Target'), type: a('Type') || '' }; } return o; };
    const join = (file, t) => { if (t.startsWith('/')) return t.slice(1); const parts = file.split('/').slice(0, -1); for (const s of t.split('/')) { if (s === '..') parts.pop(); else if (s !== '.') parts.push(s); } return parts.join('/'); };
    const relFile = f => f.replace(/([^/]+)$/, '_rels/$1.rels');
    const wbx = await txt('xl/workbook.xml'), wbr = await rels('xl/_rels/workbook.xml.rels');
    const order = [...wbx.matchAll(/<sheet\b[^>]*>/g)].map(m => ({ name: (/name="([^"]*)"/.exec(m[0]) || [])[1], rid: (/r:id="([^"]*)"/.exec(m[0]) || [])[1] }));
    // in-cell pictures (rich values)
    const meta = await txt('xl/metadata.xml'), rvx = await txt('xl/richData/rdrichvalue.xml'), rrx = await txt('xl/richData/richValueRel.xml');
    const rrr = await rels('xl/richData/_rels/richValueRel.xml.rels');
    const vmIdx = [...((/<valueMetadata[\s\S]*?<\/valueMetadata>/.exec(meta) || [''])[0]).matchAll(/<rc\b[^>]*v="(\d+)"/g)].map(m => +m[1]);
    const fm = [...meta.matchAll(/<xlrd:rvb i="(\d+)"/g)].map(m => +m[1]);
    const rv = [...rvx.matchAll(/<rv\b[^>]*>\s*<v>(\d+)<\/v>/g)].map(m => +m[1]);
    const rr = [...rrx.matchAll(/r:id="([^"]+)"/g)].map(m => m[1]);
    const seen = new Set();
    const add = (sh, r, c, path) => {
      if (!path || !zip.file(path) || !IMG.test(path)) return;
      const vendor = owner(sh, r, c), key = vendor + '|' + path; if (seen.has(key)) return; seen.add(key);
      const label = S((sh.rows[r] || [])[0]);
      out.media.push({ vendor, path, label: vendor ? label : 'Sheet "' + sh.name + '"' + (label ? ' – ' + label : ''), doc: /quote doc/i.test(label), row: r, col: c });
    };
    for (let si = 0; si < order.length; si++) {
      const sh = sheets.find(x => x.name === order[si].name), rel = wbr[order[si].rid]; if (!sh || !rel) continue;
      const sp = join('xl/workbook.xml', rel.target), sx = await txt(sp), sr = await rels(relFile(sp));
      for (const m of sx.matchAll(/<c\b[^>]*\bvm="(\d+)"[^>]*>/g)) {
        const ref = (/\br="([A-Z]+)(\d+)"/.exec(m[0]) || []); if (!ref[1]) continue;
        const ci = XLSX.utils.decode_col(ref[1]), ri = +ref[2] - 1, rid = rr[rv[fm[vmIdx[+m[1] - 1]]]];
        if (rid && rrr[rid]) add(sh, ri, ci, join('xl/richData/richValueRel.xml', rrr[rid].target));
      }
      for (const id in sr) if (/\/drawing$/.test(sr[id].type)) {
        const dp = join(sp, sr[id].target), dx = await txt(dp), dr = await rels(relFile(dp));
        for (const a of dx.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:\1>/g)) {
          const f = /<xdr:from>\s*<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(a[0]), e = /r:embed="([^"]+)"/.exec(a[0]);
          if (f && e && dr[e[1]]) add(sh, +f[2], +f[1], join(dp, dr[e[1]].target));
        }
      }
    }
    out.media.sort((a, b) => a.row - b.row || a.col - b.col);
    out.getBytes = p => zip.file(p).async('uint8array');
    return out;
  }

  const DEFAULT_CRITERIA = [['Visual Quality', 35], ['Price', 30], ['Relevant Experience', 20], ['Delivery Timeline', 15]];

  function toState(p) {
    let n = 0; const mid = () => 'm' + (++n) + Math.random().toString(36).slice(2, 7);
    const seg = (v, re) => S(v.notes).split(';').map(S).filter(s => re.test(s)).join('; ');
    const vendors = p.vendors.map((v, i) => ({
      id: 'v' + i + '_' + norm(v.name).replace(/[^a-z0-9]/g, '').slice(0, 14), ...v,
      timeline: v.timeline || seg(v, /week|timeline|day \d/i),
      revisions: v.revisions || seg(v, /revision/i),
      caveats: seg(v, /exclud|not quoted|TBD|TBC|assumed|quoted at|not stated|\d eye-level quoted|\(\d eye-level/i),
      deliverables: v.deliverables || v.items.filter(it => it.qty != null).map(it => it.qty + ' × ' + it.label.replace(/\s*\/.*$/, '') + ' (' + it.label.replace(/^.*\//, 'per ') + ')').join(' · '),
      media: [], cover: null,
    }));
    const find = name => vendors.find(v => sameVendor(v.name, name));
    const unassigned = [];
    for (const m of p.media) { const v = m.vendor && find(m.vendor); (v ? v.media : unassigned).push({ id: mid(), kind: 'image', label: m.label, source: 'Excel', zipPath: m.path, doc: !!m.doc }); }
    for (const l of p.links) {
      const c = l.url ? classifyUrl(l.url) : { kind: 'link', src: '' }, v = l.vendor && find(l.vendor);
      (v ? v.media : unassigned).push({ id: mid(), kind: c.kind, src: c.src, orig: l.url, label: l.title && !/^https?:/.test(l.title) ? l.title : l.label, group: l.label, source: 'Excel', fileName: VID.test(l.title) ? l.title : '' });
    }
    const hasScoring = p.criteria.length > 0, scores = {};
    const criteria = hasScoring
      ? p.criteria.map((c, i) => ({ id: 'c' + i, name: c.name, weight: Math.round(c.weight * 100) / 100, desc: c.desc, subs: c.subs.map((s, k) => ({ id: 'c' + i + 's' + k, name: s.name, max: s.max, check: s.check, tiers: s.tiers, rationale: s.rationale, evidence: s.evidence })) }))
      : DEFAULT_CRITERIA.map((c, i) => ({ id: 'c' + i, name: c[0], weight: c[1], desc: 'Default criterion – score 1–5.', subs: [{ id: 'c' + i + 's0', name: c[0], max: 5, min: 1, check: 'Manual 1–5 score.', tiers: [], rationale: '' }] }));
    vendors.forEach(v => { scores[v.id] = {}; });
    if (hasScoring) p.criteria.forEach((c, i) => c.subs.forEach((s, k) => vendors.forEach(v => { const x = s.scores[v.name]; scores[v.id]['c' + i + 's' + k] = x == null ? null : x; })));
    return { version: 1, project: p.project, vendors, criteria, scores, unassigned, scoringSource: hasScoring ? 'excel' : 'default' };
  }

  const api = { parseWorkbook, toState, classifyUrl, sameVendor, norm, mime, VID, IMG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MMParse = api;
})(typeof window !== 'undefined' ? window : globalThis);
