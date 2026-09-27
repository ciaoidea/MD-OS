'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('procedural discovery, complete review, action ordering and isolation',()=>{
 const r=spawnSync('python3',['-B','test/test_procedure_memory.py'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:120000});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
