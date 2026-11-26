// Builds public/data/seed.js + public/media/ from the project workbook and the vendor folders next to this app.
// Usage: node tools/build-seed.js ["path/to/workbook.xlsx"]
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const XLSX = require('xlsx'), JSZip = require('jszip'), P = require('../public/lib/parse.js');

const ROOT = path.resolve(__dirname, '..', '..');           // the Ghana project folder
const PUB = path.resolve(__dirname, '..', 'public');
const WORKBOOK = process.argv[2] || path.join(ROOT, 'Ghana Rendering Quotation_Updated.xlsx');
// Shared planner baseline: merge a vendor entry exported by Quotation Planner here.
// Quantities/rates for video use seconds. Source workbook data is never changed.
// Comparison basis for every vendor (reviewer, 2026-11-26): Hansinok's final quotation scope – 270 s multimedia + 30 s animation, stills unchanged.
// Each vendor's price is its own quoted unit rates × these quantities.
const BASIS = { multimediaSec: 270, animationSec: 30 };
// Reviewer-selected large-scale portfolio images, in the order supplied on 2026-11-26.
const HANSINOK_FEATURED = ['大尺度区域规划参考案例/20-6.jpg', '大尺度区域规划参考案例/32.jpg', '大尺度区域规划参考案例/35.jpg', '大尺度区域规划参考案例/15.jpg', '大尺度区域规划参考案例/20.jpg', '大尺度区域规划参考案例/20-3.jpg', 'Exteriors(2)/0 (227).jpg', 'Exteriors(2)/0 (361).jpg'];
function syncFeaturedImages(state) {
  const v = state.vendors.find(v => v.name === 'Hansinok');
  if (!v) throw new Error('Hansinok not found');
  const outDir = path.join(PUB, 'media', 'featured'); fs.mkdirSync(outDir, { recursive: true });
  const featured = HANSINOK_FEATURED.map((name, i) => {
    if (/保密/.test(name)) throw new Error('Confidential image excluded');
    const rel = 'Hansinok 参考资料 261012/' + name, input = process.env.MMHUB_FEATURED_ROOT ? path.join(process.env.MMHUB_FEATURED_ROOT, path.basename(name)) : path.join(ROOT, rel);
    const web = `media/featured/hansinok-${String(i + 1).padStart(2, '0')}.jpg`, output = path.join(PUB, web);
    if (process.env.MMHUB_PYTHON || process.platform !== 'darwin') {
      // MMHUB_PYTHON can point to the bundled Windows Python with Pillow.
      execFileSync(process.env.MMHUB_PYTHON || 'python3', ['-c', 'from PIL import Image,ImageOps; import sys; im=ImageOps.exif_transpose(Image.open(sys.argv[1])).convert("RGB"); im.thumbnail((2400,2400)); im.save(sys.argv[2],quality=85,optimize=True)', input, output]);
    } else execFileSync('sips', ['-Z', '2400', '-s', 'format', 'jpeg', '-s', 'formatOptions', '85', input, '--out', output], { stdio: 'ignore' });
    return { id: `hn_featured_${i + 1}`, kind: 'image', src: web, web, orig: '/files/' + rel.split('/').map(encodeURIComponent).join('/'), label: `Large-scale masterplan ${String(i + 1).padStart(2, '0')}`, source: 'Vendor portfolio', featured: true };
  });
  const originals = new Set(featured.map(m => decodeURIComponent(m.orig).split('#')[0]));
  v.media = [...featured, ...v.media.filter(m => !m.id.startsWith('hn_featured_') && !originals.has(decodeURIComponent(m.orig || m.src || '').split('#')[0]))];
  v.cover = featured[0].id; v.featuredRevision = '2026-11-26-selected-8';
}
// Targeted portfolio refresh, without rebuilding unrelated media or reading the workbook.
if (process.argv.includes('--featured-only')) {
  const file = path.join(PUB, 'data', 'seed.js');
  const state = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^window\.SEED=/, '').trim().replace(/;$/, ''));
  syncFeaturedImages(state); state.source.rev = Date.now();
  fs.writeFileSync(file, 'window.SEED=' + JSON.stringify(state) + ';\n');
  console.log('Updated the eight selected Hansinok previews; other media unchanged.'); process.exit(0);
}
// Published copy follows the comparison basis; the original workbook/document totals remain unchanged.
const PROJECT_SCOPE = `Scope: ${BASIS.multimediaSec}-s multimedia · 2 master aerials (480 km²) · 6 node aerials (3 nodes × 2) · 3 eye-level views · ${BASIS.animationSec}-s animation | Comparison basis updated 2026-11-26`;
const OLD_ICON_COMMERCIAL = 'Commercial: the highest quotation received (¥215,290 incl. tax, about S$38.4k on the Ghana quantities); 30% advance, 70% before delivery.';
const ICON_COMMERCIAL = price => `Commercial: original quotation ¥215,290 incl. tax; comparable budget S$${price.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for 2 master aerials, 6 node aerials, 3 eye-level views, ${BASIS.multimediaSec} s multimedia and ${BASIS.animationSec} s animation; 30% advance, 70% before delivery.`;
function syncPublishedText(state) {
  const previousScope = state.textCorrections?.previousScope || state.project.scope;
  state.project.scope = PROJECT_SCOPE;
  const icon = state.vendors.find(v => v.name === 'ICON');
  if (!icon || !Number.isFinite(icon.price)) throw new Error('ICON comparable budget is missing');
  const commercial = ICON_COMMERCIAL(icon.price);
  icon.keynotes = icon.keynotes.split('\n').map(line => line.startsWith('Commercial:') ? commercial : line).join('\n');
  state.textCorrections = { previousScope, scope: PROJECT_SCOPE, iconId: icon.id, previousIconCommercial: OLD_ICON_COMMERCIAL, iconCommercial: commercial };
}
// Text-only refresh preserves generated media and all quotation/score data.
if (process.argv.includes('--text-only')) {
  const file = path.join(PUB, 'data', 'seed.js');
  const state = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^window\.SEED=/, '').trim().replace(/;$/, ''));
  syncPublishedText(state);
  fs.writeFileSync(file, 'window.SEED=' + JSON.stringify(state) + ';\n');
  console.log('Updated published scope and ICON commercial text; workbook and media unchanged.');
  process.exit(0);
}
// Reviewer's rating of each vendor's reference videos, shown in Video Preview (vendors not listed: Medium).
const VIDEO_QUALITY = { Hansinok: 'High', ICON: 'High', 'Silkroad Visual': 'Low' };
const DEFAULT_COMPARE = ['Hansinok', 'AIP Studioworks', 'ICON'];
const QUOTATION_DEFAULTS = {
};
// Refresh planner constants without rebuilding media (Windows does not provide sips).
if (process.argv.includes('--planner-only')) {
  const file = path.join(PUB, 'data', 'seed.js');
  const state = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^window\.SEED=/, '').trim().replace(/;$/, ''));
  state.quotationDefaults = QUOTATION_DEFAULTS;
  fs.writeFileSync(file, 'window.SEED=' + JSON.stringify(state) + ';\n');
  console.log('Updated planner defaults; workbook and media unchanged.');
  process.exit(0);
}
// Vendor portfolio folders (folder name -> vendor name as written in the workbook).
const FOLDERS = {
  'UCHARM 参考资料 261012': 'UCHARM CG', 'Hansinok 参考资料 261012': 'Hansinok', 'AIP报价及参考资料': 'AIP Studioworks',
  '丝路报价及参考资料': 'Silkroad Visual', '蔚墨Willmore': 'Willmore', 'SNT报价及参考资料': 'SNT Visual', 'ICON报价及参考资料': 'ICON',
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
    set: { quote: '2026-11-24 · Formal (final quotation)', price: 30025, totalEx: 26800, anim15: 3225, docTotal: 32950, discount: 1 - 30025 / 51435,
      source: 'Hansinok final quotation S$32,950 (formal, SGD; modelling US$50/building excl.)',
      notes: 'SGD, tax excl.; updated formal quote S$30,025 dated 20 Nov 2026 (supersedes S$34,300 of 19 Nov and the initial S$51,435 WeChat quote); 285 s multimedia @ S$20/s; 15 s animation @ S$215/s; modelling excluded – US$50/building, TBC; 50% advance; timeline Dec 2026–Jan 2027; animation: 1 demo + 3 rounds of static-frame revisions. FINAL QUOTATION (signed and sealed by Hansinok, file “Quotation Update for Africa Masterplan Project(2).pdf”): S$32,950 = 270 s multimedia @ S$20 + 30 s animation @ S$215 + 2 master aerial @ S$2,600 + 6 key-area aerial @ S$2,100 + 3 eye-level @ S$1,100; same unit rates as the 20 Nov quote; clause 6: major model / camera / time-of-day changes after first drafts are charged by proportion of affected images, quoted for SJ’s written approval first; clause 8: untextured 3ds Max model + PSD files on full payment, editable source files at extra cost; clause 9: revisions requested Feb–May 2027 are charged separately, quoted before work starts' },
    units: [[/Node/, 2100], [/Animation/, 215], [/Multimedia/, 1200]],
  },
};
// Recommended display order (reviewer's call, editable in the app) and the three scoring categories.
const RANKS = { Hansinok: [1, ''], Willmore: [2, 'Multimedia comparatively weaker'] };
const GROUPS = [['g1', 'A · Multimedia production quality (storyline & multimedia)', [0, 1]], ['g2', 'B · Large-project experience & quality', [2, 4]], ['g3', 'C · Team capability & delivery', [3, 5, 6, 7]]];
// Reviewer's scores per criterion (points, criteria 1–8 in workbook order), reviewer's final adjustment of 2026-11-26 for Hansinok, AIP Studioworks and ICON (category totals A/B/C as reviewed; split within a category is proportional); others from the comparison exported on 2026-11-20.
// The export only carries criterion totals, so each total is spread over the sub-items in proportion to their max (0.5 steps).
const REVIEW = { date: '2026-11-26', scores: {
  Hansinok: [19, 9, 12, 13, 9, 10, 5, 10], 'AIP Studioworks': [16, 8, 13.5, 10, 3, 8.5, 5, 7],
  Willmore: [15.5, 7, 6, 7.5, 7, 7.5, 4.5, 8], 'SNT Visual': [8.5, 4.5, 5, 5.5, 3, 5, 4, 9],
  ICON: [19.5, 9, 13.5, 15, 9, 7.5, 4.5, 2] } };
// Delivery wording shown in Compare (reviewer's summary; the detailed terms stay in each vendor's Quotation terms record).
const DELIVERY = { Hansinok: ['Committed', 'Included'], 'AIP Studioworks': ['Committed', 'Included'], ICON: ['Committed', 'Included'] };
function spread(total, subs) {
  const M = subs.reduce((a, x) => a + x.max, 0), raw = subs.map(x => total * x.max / M), out = raw.map(r => Math.floor(r * 2 + 1e-9) / 2);
  let left = Math.round((total - out.reduce((a, b) => a + b, 0)) * 2);
  const order = raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  for (let k = 0; left > 0 && k < 50; k++) { const i = order[k % order.length]; if (out[i] + 0.5 <= subs[i].max) { out[i] += 0.5; left--; } }
  return out;
}
// Vendors quoted after the workbook was last saved. Totals are normalised to the Ghana quantities (3 eye-level, 5 min multimedia) like the workbook rows.
const EXTRA_VENDORS = [{
  id: 'v6_icon', name: 'ICON', quote: '2026-11-20 · Formal', currency: 'SGD', origCurrency: 'CNY', fx: 0.185, docTotal: 215290, discount: 0, modelling: 'Not stated', modelBasis: '', prepay: 0.3,
  cny: [['Master Aerial /img', 2, 25000], ['Node Aerial /img', 6, 15000], ['Eye-level /img', 3, 8000], ['Multimedia /min', 5, 4200], ['Animation /sec', 15, 1500]],
  source: 'ICON Quotation 20/11/2026 (CNY, tax incl., A Team)',
  notes: 'CNY incl. all taxes; A Team; stills 5000 px long side @ 300 dpi; video 1920 × 1080; quote total ¥215,290 (4 eye-level, 4.95 min multimedia); 30% advance, 70% before delivery; changes to model / camera view / time of day in rendering phase may incur a revision fee; design-development assistance not included',
  timeline: '', revisions: '', caveats: '4 eye-level and 4.95 min multimedia quoted (quote total ¥215,290); modelling not stated; design-development assistance excluded',
  videos: [['BDP · Ipoh Masterplan', 'https://youtu.be/g7SChRNUAdc'], ['Gensler · Dubai Riverside (4K)', 'https://youtu.be/bDVJaAk1-Ek'], ['Perkins&Will · Murabba Project', 'https://youtu.be/6L2vPpkx6LM'], ['Buro Happold · Marina Masterplans, Jeddah', 'https://youtu.be/KJ9jC_0rEKQ']],
}];
// Reviewer's key notes (one point per line) and vendor directory details. Editable in the app.
const PROFILES = {
  Hansinok: { company: 'Beijing Hansinok Co., Ltd', location: 'Beijing, China', contact: 'Charlie Yao', email: 'charlie@hansinok.com', wechat: '', keynotes: [
    'Company profile: strong market reputation and regarded as one of China’s top-tier architectural visualisation studios; fee level is at the premium end.',
    'Commercial: revised over several rounds of negotiation; within a comparable quality range, its price to us is the lowest.',
    'Large-scale experience: track record on projects of 100 km² and above, including Middle East giga-projects such as NEOM / The Line, plus multimedia production; delivery quality and visual standard are consistently high. Also has project experience in Africa.',
    'Team: the project lead takes overall accountability for the rendering deliverables; team members have architectural backgrounds and extensive large-project experience.',
    'Programme: the proposed schedule for this project is realistic and can be progressed as planned.' ] },
  Willmore: { company: 'Willmore 蔚墨', location: '', contact: 'Guo Tianfei 郭田飞', email: '', wechat: 'Guotianfei_willmore', keynotes: [
    'Company profile: a long-established visualisation and promotional media studio with a sound market reputation; has previously worked with SJ senior management.',
    'Commercial: mid-range pricing; the offer extended to SJ is competitive.',
    'Experience: has collaborated with the SJ India team and has a broad project portfolio.',
    'Programme: confident of meeting the project milestones.',
    'Watch point: multimedia capability is comparatively weaker.' ] },
  'AIP Studioworks': { company: 'AIP Studioworks', location: 'Singapore', contact: '', email: '', wechat: '', keynotes: [
    'Company profile: Singapore-based studio; the founder is ex-SJA and is familiar with SJA’s design language, and is likely to have worked with other SJ teams.',
    'Communication: based in Singapore, so coordination and reviews are straightforward.',
    'Submission: the most complete set of reference materials and videos, although quality is mid-range.',
    'Watch point: large-scale project capability is not as strong as Hansinok’s or Willmore’s.' ] },
  ICON: { company: 'Shanghai Icon Digital Technology Co., Ltd 上海艾旷数字科技有限公司', location: 'Shanghai, China', contact: 'Lucia He', email: 'hemeiling@iconcg.net', wechat: 'www.iconcg.net', keynotes: [
    'Quality: high visual and multimedia quality in the submitted samples.',
    'Experience: video samples for international practices – BDP (Ipoh Masterplan), Gensler (Dubai Riverside), Perkins&Will (Murabba), Buro Happold (Jeddah marina masterplans).',
    'Commercial: comparable budget uses the current project comparison basis; 30% advance, 70% before delivery.',
    'Watch point: modelling scope and delivery programme are not stated in the quotation.' ] },
  'SNT Visual': { company: 'SNT Visual 写意数字图像', location: '', contact: '', email: '', wechat: '', keynotes: [
    'Commercial: price-competitive.',
    'Experience: has delivered large-scale projects, including design work in Mongolia.',
    'Delivery: supported by an in-house AI studio, giving faster turnaround and responsiveness and a wider range of visual styles to choose from.' ] },
};
// Vendors whose workbook thumbnails are too small: use the folder originals instead. per = max images per sub-folder.
// exclude = never publish (e.g. files the vendor marked as under NDA); prefer = shown first; nameLabels = label from the file name.
// Documents kept in the project folder as internal records and not copied to the public site until the reviewer says so.
const HOLD = /Quotation Update for Africa Masterplan Project\(2\)|工作量计费标准/;
const IMG_LIMITS = { Hansinok: { max: 24, per: 9, dropExcel: true }, ICON: { max: 20, per: 20, exclude: /保密/, prefer: /规划|master\s?plan|island|housing|city|TOD/i, nameLabels: true, dropStills: true } };
const niceName = f => path.basename(f, path.extname(f)).replace(/IARCH\d+\S*/i, '').replace(/\s*\(\d+\)/g, '').replace(/第二轮/g, '').replace(/^[A-Za-z]-(?=[A-Za-z])/, '').replace(/[-+\s]+$/, '').replace(/\s{2,}/g, ' ').trim();
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
  for (const e of EXTRA_VENDORS) {
    const { cny, videos, ...v } = e, sg = x => Math.round(x * e.fx * 100) / 100, tot = cny.reduce((a, c) => a + c[1] * c[2], 0), anim = cny.filter(c => /Animation/.test(c[0])).reduce((a, c) => a + c[1] * c[2], 0);
    Object.assign(v, { price: sg(tot), gross: sg(tot), totalEx: sg(tot - anim), anim15: sg(anim), items: cny.map(c => ({ label: c[0], qty: c[1], unit: sg(c[2]), unitOrig: c[2] })), deliverables: st.vendors[0].deliverables, cover: null,
      media: videos.flatMap(([label, u], i) => { const id = /youtu\.be\/([\w-]+)/.exec(u)[1]; return [{ id: e.id + 'v' + i, kind: 'embed', src: P.classifyUrl(u).src, orig: u, label, source: 'Vendor email' }, { id: e.id + 'i' + i, kind: 'image', src: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, orig: u, label: label + ' (video still)', source: 'YouTube' }]; }) });
    st.vendors.push(v); st.scores[v.id] = {};
  }
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
    for (const f of files.filter((f, i, a) => /\.(pdf|docx?)$/i.test(f) && !HOLD.test(path.basename(f)) && a.findIndex(x => path.basename(x) === path.basename(f)) === i)) v.media.push({ id: 'f' + (++n), kind: 'link', src: url(f), orig: url(f), label: path.basename(f), source: 'Local folder', ...(fs.statSync(f).size < 2e7 ? { web: host(f) } : {}) });
    const lim = IMG_LIMITS[vname] || { max: MAX_IMAGES, per: Infinity }, cnt = {}, pri = f => lim.prefer ? (lim.prefer.test(path.basename(f)) ? 0 : 1) : /非洲/.test(f) ? 0 : /大尺度/.test(f) ? 1 : 2;
    const imgs = files.filter(f => P.IMG.test(f) && !(lim.exclude && lim.exclude.test(f))).sort((a, b) => pri(a) - pri(b)).filter(f => { const g = path.dirname(f); cnt[g] = (cnt[g] || 0) + 1; return cnt[g] <= lim.per; }).slice(0, lim.max);
    if (lim.dropExcel && imgs.length) v.media = v.media.filter(m => !(m.source === 'Excel' && m.kind === 'image'));
    if (lim.dropStills && imgs.length) v.media = v.media.filter(m => m.source !== 'YouTube');
    const seq = {};
    for (const f of imgs) {
      // unified image names: "<folder> 01", or "<vendor> 参考图 01" for files at the folder root
      const sub = path.basename(path.dirname(f)), grp = path.dirname(f) === dir ? v.name.split(' ')[0] + ' 参考图' : sub.replace(/\(\d+\)$/, '');
      seq[grp] = (seq[grp] || 0) + 1;
      const m = { id: 'f' + (++n), kind: 'image', src: url(f), orig: url(f), label: lim.nameLabels ? niceName(f) : `${grp} ${pad(seq[grp])}`, source: 'Local folder' };
      if (fs.statSync(f).size > DIRECT_LIMIT) { // large original: build a 2400px preview, keep the link to the original
        const out = path.join(PUB, 'media', 'preview', 'p' + n + '.jpg');
        try { execFileSync('sips', ['-Z', '2400', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', f, '--out', out], { stdio: 'ignore' }); m.src = 'media/preview/p' + n + '.jpg'; } catch (e) { console.warn('no preview for', f); }
      }
      m.web = m.src.startsWith('media/') ? m.src : host(f);
      v.media.push(m);
    }
  }
  for (const [name, o] of Object.entries(OVERRIDES)) { const v = st.vendors.find(x => P.sameVendor(x.name, name)); if (!v) continue; Object.assign(v, o.set); for (const [re, u] of o.units) for (const it of v.items) if (re.test(it.label)) it.unit = it.unitOrig = u; v.updated = true; }
  for (const v of st.vendors) { // re-price every itemised vendor on the common basis
    if (!v.items || !v.items.length || v.price == null) continue;
    for (const it of v.items) { if (/Multimedia/i.test(it.label)) it.qty = BASIS.multimediaSec / (/\/min/i.test(it.label) ? 60 : 1); if (/Animation/i.test(it.label)) it.qty = BASIS.animationSec / (/\/min/i.test(it.label) ? 60 : 1); }
    const r2 = n => Math.round(n * 100) / 100, line = it => r2(it.qty * it.unit), anim = v.items.filter(it => /Animation/i.test(it.label)).reduce((a, it) => a + line(it), 0);
    v.price = r2(v.items.reduce((a, it) => a + line(it), 0) + (typeof v.modelling === 'number' ? v.modelling : 0)); v.anim15 = anim; v.totalEx = r2(v.price - anim); if (v.gross != null && !v.discount) v.gross = v.price;
    v.deliverables = v.items.map(it => /\/(min|sec)/i.test(it.label) ? `${it.qty * (/\/min/i.test(it.label) ? 60 : 1)} s ${it.label.replace(/\s*\/.*$/, '')}` : `${it.qty} × ${it.label.replace(/\s*\/.*$/, '')}`).join(' · ');
  }
  const low = Math.min(...st.vendors.filter(v => v.price != null).map(v => v.price)), ps = st.criteria.flatMap(c => c.subs).find(s => /evaluated price/i.test(s.name));
  for (const v of st.vendors) { if (v.price == null) continue; v.vsLowest = v.price / low - 1; if (v.updated && ps) { const r = v.price / low; (st.scores[v.id] = st.scores[v.id] || {})[ps.id] = ps.max * (r <= 1.1 ? 1 : r <= 1.3 ? 0.5 : r <= 1.5 ? 0.3 : 0); ps.rationale = (ps.rationale || '') + ` Updated ${st.vendors.find(x => x === v).quote.slice(0, 10)}: ${v.name} ${v.currency} ${v.price.toLocaleString('en-SG')} = ${Math.round(r * 100)}% of the lowest quote.`; } delete v.updated; }
  for (const [name, pts] of Object.entries(REVIEW.scores)) { const v = st.vendors.find(x => P.sameVendor(x.name, name)); if (!v) { console.warn('review: vendor not found', name); continue; } st.criteria.forEach((c, i) => spread(pts[i], c.subs).forEach((x, k) => { (st.scores[v.id] = st.scores[v.id] || {})[c.subs[k].id] = x; })); }
  st.scoringNote = `criteria from workbook · scores reviewed ${REVIEW.date}`;
  for (const v of st.vendors) { const k = Object.keys(PROFILES).find(n => P.sameVendor(v.name, n)), pr = PROFILES[k] || {}; Object.assign(v, { company: pr.company || v.name, location: pr.location || '', contact: pr.contact || '', email: pr.email || '', wechat: pr.wechat || '', keynotes: (pr.keynotes || []).join('\n') }); }
  for (const [name, d] of Object.entries(DELIVERY)) { const v = st.vendors.find(x => P.sameVendor(x.name, name)); if (v) { v.timeline = d[0]; v.revisions = d[1]; } }
  for (const [name, [rank, note]] of Object.entries(RANKS)) { const v = st.vendors.find(x => P.sameVendor(x.name, name)); if (v) { v.rank = rank; v.recNote = note; } }
  st.groups = GROUPS.map(g => ({ id: g[0], name: g[1] })); st.criteria.forEach((c, i) => { c.group = (GROUPS.find(g => g[2].includes(i)) || GROUPS[2])[0]; });
  st.vendors.forEach(v => { const c = v.media.find(m => m.kind === 'image' && !m.doc); v.cover = c ? c.id : null; });
  for (const v of st.vendors) { const k = Object.keys(VIDEO_QUALITY).find(n => P.sameVendor(v.name, n) || v.name.startsWith(n)); v.videoQuality = k ? VIDEO_QUALITY[k] : 'Medium'; }
  st.quotationDefaults = QUOTATION_DEFAULTS; st.defaultCompare = DEFAULT_COMPARE.map(n => (st.vendors.find(x => P.sameVendor(x.name, n)) || {}).id).filter(Boolean);
  syncPublishedText(st);
  syncFeaturedImages(st);
  st.source = { workbook: path.basename(WORKBOOK), built: new Date().toISOString().slice(0, 10), rev: Date.now() };
  fs.writeFileSync(path.join(PUB, 'data', 'seed.js'), 'window.SEED=' + JSON.stringify(st) + ';\n');
  console.log(st.vendors.map(v => `${v.name}: ${v.currency} ${v.price} | img ${v.media.filter(m => m.kind === 'image').length} vid ${v.media.filter(m => m.kind === 'video' || m.kind === 'embed').length} link ${v.media.filter(m => m.kind === 'link').length}`).join('\n'));
  console.log('unassigned', st.unassigned.length, '| criteria', st.criteria.length, '| weights', st.criteria.reduce((a, c) => a + c.weight, 0));
})();
