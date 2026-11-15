import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deductions,freshJournal,restoreJournal,deduce,ready} from '../src/investigation.ts';
const found=['message','draft','inspection','ledger','boat'];
test('deductions require the right answer and all recovered supporting documents',()=>{
 const j=freshJournal(),d=deductions[0];
 assert.equal(deduce(j,found,d.id,d.options[1],d.requires),j);
 assert.equal(deduce(j,[],d.id,d.answer,d.requires),j);
 assert.equal(deduce(j,found,d.id,d.answer,['message']),j);
 const solved=deduce(j,found,d.id,d.answer,d.requires);
 assert.deepEqual(solved.solved,['location']);
 assert.equal(deduce(solved,found,d.id,d.answer,d.requires),solved);
 assert.deepEqual(j,freshJournal());
});
test('complete investigation requires all deductions and rescue documents',()=>{
 let j=freshJournal();assert.equal(ready(found,j),false);
 for(const d of deductions)j=deduce(j,found,d.id,d.answer,d.requires);
 assert.equal(ready(found,j),true);assert.equal(ready(['message'],j),false);
 assert.deepEqual(restoreJournal(JSON.stringify(j),found),j);
});
test('journal recovery rejects fabricated deductions and bounds user data',()=>{
 assert.deepEqual(restoreJournal('{broken',found),freshJournal());
 assert.deepEqual(restoreJournal(null,found),freshJournal());
 const j=restoreJournal(JSON.stringify({solved:['fake','location','location'],notes:'x'.repeat(5000),hints:99}),found);
 assert.deepEqual(j.solved,['location']);assert.equal(j.notes.length,4000);assert.equal(j.hints,3);
 assert.deepEqual(restoreJournal(JSON.stringify(j),[]).solved,[]);
});
