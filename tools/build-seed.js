// Builds public/data/seed.js + public/media/ from the project workbook and the vendor folders next to this app.
// Usage: node tools/build-seed.js ["path/to/workbook.xlsx"]
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const XLSX = require('xlsx'), JSZip = require('jszip'), P = require('../public/lib/parse.js');

const ROOT = path.resolve(__dirname, '..', '..');           // the Ghana project folder
const PUB = path.resolve(__dirname, '..', 'public');
const WORKBOOK = process.argv[2] || path.join(ROOT, 'Ghana Rendering Quotation_Updated.xlsx');
// Vendor portfolio folders (folder name -> vendor name as written in the workbook).
const FOLDERS = {
  'UCHARM 参考资料 261012': 'UCHARM CG', 'Hansinok 参考资料 261012': 'Hansinok', 'AIP报价及参考资料': 'AIP Studioworks',
  '丝路报价及参考资料': 'Silkroad Visual', '蔚墨Willmore': 'Willmore', 'SNT报价及参考资料': 'SNT Visual',
};
const MAX_IMAGES = 16, DIRECT_LIMIT = 3e6;
// Display names for videos (file basename -> project title). Hash-named files were titled from the
// project name shown in their first 10 seconds; the source files themselves are not renamed.
const VIDEO_NAMES = {
  'ce96edddb8d55f7b3fbae58b93ca7d01_raw.mp4': '金华婺城区 · 长湖湾活力新城核心区',
  '53e9e578d26d90cd9f2b2ad3d3d7ceb1.mp4': '上海 · Exciting-Hub 卓越心枢纽',
  '53e9e578d26d90cd9f2b2ad3d3d7ceb1_raw.mp4': '上海 · Exciting-Hub 卓越心枢纽（原始版）',
  '7154a2c560cc901f6edca6c03126d8ef_raw.mp4': '上海外滩 · 和平之心 | 玲珑之心',
  '0142eedcb6cb50d09b399dd37b9099df_raw.mp4': 'India · BIDA Bundelkhand Industrial Development Authority',
  'a0d7f0441418328a222fe6a2f6092bb8_raw.mp4': 'India · Telangana “The Future City”',
  '8e1128192e819509c04e31bf831f0e06_raw.mp4': '上海 · 引力中城',
  '特效合集.mp4': 'SNT · 特效合集',
  '重庆特钢厂0112带音效版.mp4': '重庆 · 特钢厂（带音效版）',
  '20250603-新加披国立大学医院设计方案-多媒.mp4': '新加坡 · 国立大学医院设计方案',
  '郑州视频0114.mp4': '郑州 · 规划视频',
  '中规院清华院联合体电子成果提交设计成果第.mp4': '中规院清华院联合体 · 设计成果',
  '1 West Saudi master plan - 4k.mp4': 'Saudi Arabia · West Saudi Master Plan (4K)',
  'DUBAI SOUTH GOLF DISTRICT.mp4': 'Dubai · Dubai South Golf District',
};
// OneDrive share links (organisation, view-only) for videos the workbook has no link for (file basename -> link).
const OD = 'https://surbanajurong-my.sharepoint.com/:v:/g/personal/jiaqi_xu_sjgroup_com/';
const VIDEO_LINKS = {
  'DUBAI SOUTH GOLF DISTRICT.mp4': OD + 'IQDUYIjyFluzQ7Pf40NKzgyAAfljHH86AWumU52XEJEuyWY',
  '53e9e578d26d90cd9f2b2ad3d3d7ceb1.mp4': OD + 'IQCW13FjQXe7QoE0VLiWRtnAATzThJLtGc0ggpxpYxid908',
  '7154a2c560cc901f6edca6c03126d8ef_raw.mp4': OD + 'IQAcYMIftasYRI6LzWX1vZiMAeDTzHXPxl1wGph0zEGiJiQ',
  'ce96edddb8d55f7b3fbae58b93ca7d01_raw.mp4': OD + 'IQA8pBeNJzbBS4ZVazDZcj7tAcUwLyK-NC6YY4tlCz9VD9c',
  '53e9e578d26d90cd9f2b2ad3d3d7ceb1_raw.mp4': OD + 'IQBuZN4V9rhPSpF-ceaULwFaAZxuLc7-FirpKJr4grgF9-w',
  '8e1128192e819509c04e31bf831f0e06_raw.mp4': OD + 'IQBJ1p8purpYTYQP7W5SsLCRAZ0yELDeapbc74xsQcSSgYk',
  '0142eedcb6cb50d09b399dd37b9099df_raw.mp4': OD + 'IQDIOJzYT31wS7inq5UWRgVTAWE2e-eeHPqTYhTzAHKX6js',
  'a0d7f0441418328a222fe6a2f6092bb8_raw.mp4': OD + 'IQB7nbydapTGTZnzfBMWUVpBAWK9NwWbtEmTR6SU9sqqrN8',
  '特效合集.mp4': OD + 'IQAn2feZWZVITo9urHACIpp6AXx23Q5pdwB3GGf-_2kp96A',
};
// OneDrive file ids -> in-page player (embed.aspx); viewers must be signed in to the organisation.
const EMB = id => `https://surbanajurong-my.sharepoint.com/personal/jiaqi_xu_sjgroup_com/_layouts/15/embed.aspx?UniqueId=${id}&embed=%7B%22ust%22%3Atrue%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create`;
const VIDEO_IDS = {
  '1 West Saudi master plan - 4k.mp4': '64aadcbf-c8a8-4373-a23e-b88df675ea7d', 'DUBAI SOUTH GOLF DISTRICT.mp4': 'f28860d4-5b16-43b3-b3df-e3434ace0c80',
  '53e9e578d26d90cd9f2b2ad3d3d7ceb1.mp4': '6371d796-7741-42bb-8134-54b89646d9c0', '7154a2c560cc901f6edca6c03126d8ef_raw.mp4': '1fc2601c-abb5-4418-8e8b-cd65f5bd988c',
  'ce96edddb8d55f7b3fbae58b93ca7d01_raw.mp4': '8d17a43c-3627-4bc1-8655-6b30d9723eed', '53e9e578d26d90cd9f2b2ad3d3d7ceb1_raw.mp4': '15de646e-b8f6-4a4f-917e-71e6942f015a',
  '郑州视频0114.mp4': 'deeabef9-a318-48e9-ad30-08fdf21c07b3', '中规院清华院联合体电子成果提交设计成果第.mp4': '4b680c02-84e7-412a-ac0c-61e2fbe29b0e',
  '重庆特钢厂0112带音效版.mp4': '2d7d9bb8-370f-49da-b46e-099d1b190b14', '20250603-新加披国立大学医院设计方案-多媒.mp4': '5fa97d54-b331-4654-9f2c-6d4227947cb7',
  '8e1128192e819509c04e31bf831f0e06_raw.mp4': '299fd649-baba-4d58-840f-ed6e52b0b091', '0142eedcb6cb50d09b399dd37b9099df_raw.mp4': 'd89c38c8-7d4f-4b70-b8a7-ab9516460553',
  'a0d7f0441418328a222fe6a2f6092bb8_raw.mp4': '9dbc9d7b-946a-4dc6-99f3-7c1316515a41', '特效合集.mp4': '99f7d927-9559-4e48-8f6e-ac7002229a7a',
};
// Quotation updates received after the workbook was last saved (the workbook itself is not modified).
const OVERRIDES = {
  Hansinok: {
    set: { quote: '2026-11-20 · Formal (updated quotation)', price: 30025, totalEx: 26800, anim15: 3225, docTotal: 30025, discount: 1 - 30025 / 51435,
      source: 'Hansinok Quotation Update 2026-11-20 (formal, SGD; modelling US$50/building excl.)',
      notes: 'SGD, tax excl.; updated formal quote S$30,025 dated 20 Nov 2026 (supersedes S$34,300 of 19 Nov and the initial S$51,435 WeChat quote); 285 s multimedia @ S$20/s; 15 s animation @ S$215/s; modelling excluded – US$50/building, TBC; 50% advance; timeline Dec 2026–Jan 2027; animation: 1 demo + 3 rounds of static-frame revisions' },
    units: [[/Node/, 2100], [/Animation/, 215]],
  },
};
// Recommended display order (reviewer's call, editable in the app) and the three scoring categories.
const RANKS = { Hansinok: [1, ''], Willmore: [2, 'Multimedia comparatively weaker'] };
const GROUPS = [['g1', 'A · Multimedia production quality (storyline & multimedia)', [0, 2]], ['g2', 'B · Large-project experience & quality', [1, 4]], ['g3', 'C · Team capability & delivery', [3, 5, 6, 7]]];
// Vendors whose workbook thumbnails are too small: use the folder originals instead. per = max images per sub-folder.
const IMG_LIMITS = { Hansinok: { max: 24, per: 9, dropExcel: true } };
// Portfolio PDFs whose pages are rendering images (one image per page) -> shown as gallery images.
const PDF_IMAGES = { '上海中城效果图.pdf': '上海 · 引力中城 效果图', 'Ucharm CG Portfolio.pdf': 'UCHARM CG Portfolio' };
const pad = k => String(k).padStart(2, '0');
function pdfImages(f, outDir, prefix) { // extract the page images with pypdf, then cap at 2400px
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mmhub-'));
  const py = 'import sys\nfrom pypdf import PdfReader\nr=PdfReader(sys.argv[1])\nfor i,p in enumerate(r.pages):\n  ims=sorted(p.images,key=lambda x:-len(x.data))\n  if ims and len(ims[0].data)>50000: open("%s/%03d.%s"%(sys.argv[2],i+1,ims[0].name.split(".")[-1]),"wb").write(ims[0].data)\n';
  const out = [];
  try {
    execFileSync('python3', ['-c', py, f, tmp], { stdio: 'ignore' });
    for (const name of fs.readdirSync(tmp).sort()) {
      const page = parseInt(name, 10), rel = `media/pdf/${prefix}_${pad(page)}.jpg`;
      execFileSync('sips', ['-Z', '2400', '-s', 'format', 'jpeg', '-s', 'formatOptions', '85', path.join(tmp, name), '--out', path.join(outDir, rel)], { stdio: 'ignore' });
      out.push({ page, rel });
    }
  } catch (e) { console.warn('PDF pages not extracted (needs python3 + pypdf):', path.basename(f)); }
  fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}

const walk = (dir, depth = 0) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const f = path.join(dir, e.name);
  return e.isDirectory() ? (depth < 3 ? walk(f, depth + 1) : []) : [f];
});
let hn = 0;
const host = f => { const rel = 'media/local/h' + (++hn) + path.extname(f).toLowerCase(); fs.copyFileSync(f, path.join(PUB, rel)); return rel; }; // hosted copy for the online build
const url = f => '/files/' + path.relative(ROOT, f).split(path.sep).map(encodeURIComponent).join('/');

(async () => {
  const buf = fs.readFileSync(WORKBOOK);
  const parsed = await P.parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), XLSX, JSZip);
  const st = P.toState(parsed);
  fs.rmSync(path.join(PUB, 'media'), { recursive: true, force: true });
  fs.mkdirSync(path.join(PUB, 'media', 'xl'), { recursive: true }); fs.mkdirSync(path.join(PUB, 'media', 'preview'), { recursive: true }); fs.mkdirSync(path.join(PUB, 'media', 'pdf'), { recursive: true }); fs.mkdirSync(path.join(PUB, 'media', 'local'), { recursive: true });
  fs.mkdirSync(path.join(PUB, 'data'), { recursive: true });
  for (const m of [...st.vendors.flatMap(v => v.media), ...st.unassigned]) if (m.zipPath) {
    const name = path.basename(m.zipPath);
    fs.writeFileSync(path.join(PUB, 'media', 'xl', name), await parsed.getBytes(m.zipPath));
    m.src = 'media/xl/' + name; delete m.zipPath;
  }
  let n = 0;
  for (const [folder, vname] of Object.entries(FOLDERS)) {
    const dir = path.join(ROOT, folder), v = st.vendors.find(x => P.sameVendor(x.name, vname));
    if (!v || !fs.existsSync(dir)) { console.warn('skip folder', folder); continue; }
    const files = walk(dir).filter(f => !path.basename(f).startsWith('.')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    // videos: attach local file to the matching workbook entry, otherwise add as local-folder media
    for (const f of files.filter(f => P.VID.test(f))) {
      const hit = v.media.find(m => m.fileName === path.basename(f));
      if (hit) { hit.link = hit.orig; hit.kind = 'video'; hit.src = hit.orig = url(f); hit.source = 'Excel + local file'; }
      else v.media.push({ id: 'f' + (++n), kind: 'video', src: url(f), orig: url(f), label: path.basename(f), fileName: path.basename(f), source: 'Local folder' });
    }
    v.media.forEach(m => { if (m.fileName && VIDEO_NAMES[m.fileName]) m.label = VIDEO_NAMES[m.fileName]; if (m.kind === 'video' && !m.link && VIDEO_LINKS[m.fileName]) m.link = VIDEO_LINKS[m.fileName]; if (m.kind === 'video' && VIDEO_IDS[m.fileName]) m.embed = EMB(VIDEO_IDS[m.fileName]); });
    for (const f of files.filter(f => PDF_IMAGES[path.basename(f)])) {
      const title = PDF_IMAGES[path.basename(f)];
      for (const pg of pdfImages(f, PUB, 'pdf' + (++n))) v.media.push({ id: 'f' + (++n), kind: 'image', src: pg.rel, orig: url(f) + '#page=' + pg.page, label: `${title} ${pad(pg.page)}`, source: 'Local PDF', web: pg.rel });
    }
    for (const f of files.filter(f => /\.(pdf|docx?)$/i.test(f))) v.media.push({ id: 'f' + (++n), kind: 'link', src: url(f), orig: url(f), label: path.basename(f), source: 'Local folder', ...(fs.statSync(f).size < 2e7 ? { web: host(f) } : {}) });
    const lim = IMG_LIMITS[vname] || { max: MAX_IMAGES, per: Infinity }, cnt = {}, pri = f => /非洲/.test(f) ? 0 : /大尺度/.test(f) ? 1 : 2;
    const imgs = files.filter(f => P.IMG.test(f)).sort((a, b) => pri(a) - pri(b)).filter(f => { const g = path.dirname(f); cnt[g] = (cnt[g] || 0) + 1; return cnt[g] <= lim.per; }).slice(0, lim.max);
    if (lim.dropExcel && imgs.length) v.media = v.media.filter(m => !(m.source === 'Excel' && m.kind === 'image'));
    const seq = {};
    for (const f of imgs) {
      // unified image names: "<folder> 01", or "<vendor> 参考图 01" for files at the folder root
      const sub = path.basename(path.dirname(f)), grp = path.dirname(f) === dir ? v.name.split(' ')[0] + ' 参考图' : sub.replace(/\(\d+\)$/, '');
      seq[grp] = (seq[grp] || 0) + 1;
      const m = { id: 'f' + (++n), kind: 'image', src: url(f), orig: url(f), label: `${grp} ${pad(seq[grp])}`, source: 'Local folder' };
      if (fs.statSync(f).size > DIRECT_LIMIT) { // large original: build a 2400px preview, keep the link to the original
        const out = path.join(PUB, 'media', 'preview', 'p' + n + '.jpg');
        try { execFileSync('sips', ['-Z', '2400', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', f, '--out', out], { stdio: 'ignore' }); m.src = 'media/preview/p' + n + '.jpg'; } catch (e) { console.warn('no preview for', f); }
      }
      m.web = m.src.startsWith('media/') ? m.src : host(f);
      v.media.push(m);
    }
  }
  for (const [name, o] of Object.entries(OVERRIDES)) { const v = st.vendors.find(x => P.sameVendor(x.name, name)); if (!v) continue; Object.assign(v, o.set); for (const [re, u] of o.units) for (const it of v.items) if (re.test(it.label)) it.unit = it.unitOrig = u; v.updated = true; }
  const low = Math.min(...st.vendors.filter(v => v.price != null).map(v => v.price)), ps = st.criteria.flatMap(c => c.subs).find(s => /evaluated price/i.test(s.name));
  for (const v of st.vendors) { if (v.price == null) continue; v.vsLowest = v.price / low - 1; if (v.updated && ps) { const r = v.price / low; (st.scores[v.id] = st.scores[v.id] || {})[ps.id] = ps.max * (r <= 1.1 ? 1 : r <= 1.3 ? 0.5 : r <= 1.5 ? 0.3 : 0); ps.rationale = (ps.rationale || '') + ` Updated ${st.vendors.find(x => x === v).quote.slice(0, 10)}: ${v.name} ${v.currency} ${v.price.toLocaleString('en-SG')} = ${Math.round(r * 100)}% of the lowest quote.`; } delete v.updated; }
  for (const [name, [rank, note]] of Object.entries(RANKS)) { const v = st.vendors.find(x => P.sameVendor(x.name, name)); if (v) { v.rank = rank; v.recNote = note; } }
  st.groups = GROUPS.map(g => ({ id: g[0], name: g[1] })); st.criteria.forEach((c, i) => { c.group = (GROUPS.find(g => g[2].includes(i)) || GROUPS[2])[0]; });
  st.vendors.forEach(v => { const c = v.media.find(m => m.kind === 'image' && !m.doc); v.cover = c ? c.id : null; });
  st.source = { workbook: path.basename(WORKBOOK), built: new Date().toISOString().slice(0, 10), rev: Date.now() };
  fs.writeFileSync(path.join(PUB, 'data', 'seed.js'), 'window.SEED=' + JSON.stringify(st) + ';\n');
  console.log(st.vendors.map(v => `${v.name}: ${v.currency} ${v.price} | img ${v.media.filter(m => m.kind === 'image').length} vid ${v.media.filter(m => m.kind === 'video' || m.kind === 'embed').length} link ${v.media.filter(m => m.kind === 'link').length}`).join('\n'));
  console.log('unassigned', st.unassigned.length, '| criteria', st.criteria.length, '| weights', st.criteria.reduce((a, c) => a + c.weight, 0));
})();
