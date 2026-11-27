const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { sync } = require('../public/lib/state-sync.js');
const box = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/data/seed.js'), 'utf8'), box);
const seed = JSON.parse(JSON.stringify(box.window.SEED)), stale = structuredClone(seed);
// Reproduce the screenshot: newest source.rev and images, but old commercial data and scores.
const hn = stale.vendors.find(v => v.name === 'Hansinok');
hn.price = 30025; hn.quote = '2026-11-20 · Formal'; hn.items[3].qty = 5; hn.items[3].unit = 1140;
stale.scores[hn.id].c0s0 = 10;
stale.appliedScoreCorrection = seed.scoreCorrection.id;
hn.media.push({ id: 'own-file', kind: 'image', source: 'User', blobId: 'keep-this-blob' });
const result = sync(stale, seed);
assert.equal(result.changed, true);
assert.equal(stale.vendors.find(v => v.id === hn.id).price, 30025, 'Do not mutate the saved backup');
for (const v of seed.vendors) {
  const current = result.state.vendors.find(x => x.id === v.id);
  assert.equal(current.price, v.price); assert.equal(current.quote, v.quote); assert.deepEqual(current.items, v.items);
  assert.deepEqual(result.state.scores[v.id], seed.scores[v.id]);
}
assert(result.state.vendors.find(v => v.id === hn.id).media.some(m => m.blobId === 'keep-this-blob'));
assert.deepEqual(result.state.criteria, seed.criteria);
const local = result.state;
local.scores[hn.id].c0s0 = 8;
assert.equal(sync(local, seed).changed, false, 'Keep subsequent local edits until published baseline changes');
assert.equal(sync(local, seed).state.scores[hn.id].c0s0, 8);
const mediaRelease = structuredClone(seed); mediaRelease.source.rev++; mediaRelease.vendors[0].media = [];
assert.equal(sync(local, mediaRelease).changed, false, 'Media-only releases must not reset assessment edits');
const release = structuredClone(seed); release.vendors.find(v => v.id === hn.id).price++;
assert.equal(sync(local, release).changed, true);
const imported = { ...stale, importedFrom: 'intentional-workbook.xlsx' };
assert.equal(sync(imported, seed).changed, false);
console.log('PASS: stale cached revision, complete prices/scores, preserved uploads, repeat visits, media-only release and imported workbook.');
