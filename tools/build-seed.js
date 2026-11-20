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
    v.media.forEach(m => { if (m.fileName && VIDEO_NAMES[m.fileName]) m.label = VIDEO_NAMES[m.fileName]; if (m.kind === 'video' && !m.link && VIDEO_LINKS[m.fileName]) m.link = VIDEO_LINKS[m.fileName]; });
    for (const f of files.filter(f => PDF_IMAGES[path.basename(f)])) {
      const title = PDF_IMAGES[path.basename(f)];
      for (const pg of pdfImages(f, PUB, 'pdf' + (++n))) v.media.push({ id: 'f' + (++n), kind: 'image', src: pg.rel, orig: url(f) + '#page=' + pg.page, label: `${title} ${pad(pg.page)}`, source: 'Local PDF', web: pg.rel });
    }
    for (const f of files.filter(f => /\.(pdf|docx?)$/i.test(f))) v.media.push({ id: 'f' + (++n), kind: 'link', src: url(f), orig: url(f), label: path.basename(f), source: 'Local folder', ...(fs.statSync(f).size < 2e7 ? { web: host(f) } : {}) });
    const imgs = files.filter(f => P.IMG.test(f)).sort((a, b) => /非洲/.test(b) - /非洲/.test(a)).slice(0, MAX_IMAGES);
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
  st.vendors.forEach(v => { const c = v.media.find(m => m.kind === 'image' && !m.doc); v.cover = c ? c.id : null; });
  st.source = { workbook: path.basename(WORKBOOK), built: new Date().toISOString().slice(0, 10), rev: Date.now() };
  fs.writeFileSync(path.join(PUB, 'data', 'seed.js'), 'window.SEED=' + JSON.stringify(st) + ';\n');
  console.log(st.vendors.map(v => `${v.name}: ${v.currency} ${v.price} | img ${v.media.filter(m => m.kind === 'image').length} vid ${v.media.filter(m => m.kind === 'video' || m.kind === 'embed').length} link ${v.media.filter(m => m.kind === 'link').length}`).join('\n'));
  console.log('unassigned', st.unassigned.length, '| criteria', st.criteria.length, '| weights', st.criteria.reduce((a, c) => a + c.weight, 0));
})();
