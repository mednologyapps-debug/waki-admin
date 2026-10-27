import {csvField} from '../src/lib/csv.js';import assert from 'node:assert/strict';
for(const s of ['=1+1','+cmd','-3+2','@SUM(A1:A2)','\t=HYPERLINK("https://example.test")','\r\n=1','  +1'])assert.ok(csvField(s).startsWith('"\''));
assert.equal(csvField('Hotel WAKI'),'"Hotel WAKI"');assert.equal(csvField('Hotel "A"'),'"Hotel ""A"""');assert.equal(csvField(null),'""');console.log('CSV: spreadsheet formula/control-character injection protected.');
