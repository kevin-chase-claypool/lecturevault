import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source = await readFile(new URL('../lib/reconstruction-sync.ts', import.meta.url), 'utf8');
const moduleSource = stripTypeScriptTypes(source).replace("'./state-sync'", JSON.stringify(new URL('../lib/state-sync.ts', import.meta.url).href));
const { replaceDraft, retireDraft, sameDraft } = await import('data:text/javascript;base64,' + Buffer.from(moduleSource).toString('base64'));

const older = { id: 'older', sources: [{ id: 'old-notes' }] };
const phone = { id: 'class', sources: [{ id: 'audio', storagePath: 'audio.mp3' }] };
let cloud = replaceDraft([older], phone);
let tablet = structuredClone(cloud.find(item => item.id === 'class'));
assert.deepEqual(tablet.sources, phone.sources);
tablet.sources.push({ id: 'notes', storagePath: 'notes.pdf' });
cloud = replaceDraft(cloud, tablet);
assert.deepEqual(cloud.find(item => item.id === 'class').sources.map(item => item.id), ['audio', 'notes']);
assert.equal(cloud.find(item => item.id === 'older'), older);
assert.equal(cloud.filter(item => item.id === 'class').length, 1);
assert.deepEqual(replaceDraft(cloud, tablet), cloud); // repeat save does not duplicate
assert.equal(sameDraft(phone, tablet), false); // stale preview detected
assert.equal(sameDraft(tablet, structuredClone(tablet)), true);
assert.deepEqual(retireDraft(cloud, 'class'), [older]);
assert.deepEqual(retireDraft(cloud, 'missing'), cloud);
console.log('Device version checks passed: phone audio → tablet notes → cloud; explicit replacement, unrelated records, stale snapshots, idempotence, retirement.');
