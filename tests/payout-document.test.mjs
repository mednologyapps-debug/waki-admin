import assert from 'node:assert/strict'
import {PDFDocument} from 'pdf-lib'
import {payoutPdf,payoutHtml} from '../src/lib/payoutDocument.js'
import {createFinanceDemo,demoDetail,demoPayout} from '../src/lib/financeDemo.js'
import fs from 'node:fs/promises'
const demo=createFinanceDemo()
assert.equal(demoDetail(demo).quote.amount,414)
assert.equal(demoDetail(demo).summary.deposited,570.4)
const settled=demoPayout(demo,{reference:'DEMO-NEW',paid_on:'2026-10-19'})
assert.equal(demoDetail(settled).quote.amount,0)
assert.equal(demoDetail(settled).summary.payout_count,3)
assert.equal(demoDetail(demo).quote.amount,414)
const r=settled.payouts.at(-1)
const pdf=await PDFDocument.load(await payoutPdf(r))
assert.equal(pdf.getPageCount(),1)
const large=await PDFDocument.load(await payoutPdf({...r,items:Array.from({length:130},(_,i)=>({...r.items[i%r.items.length],id:'row-'+i}))}))
assert.ok(large.getPageCount()>5)
assert.ok(payoutHtml({...r,hotel_name:'<script>alert(1)</script>'}).includes('&lt;script&gt;'))
assert.equal(await fs.readFile(new URL('../src/lib/payoutDocument.js',import.meta.url),'utf8'),await fs.readFile(new URL('../supabase/functions/admin-payout/payoutDocument.js',import.meta.url),'utf8'))
console.log('PDF: demo balances, simulated history, one/multiple pages, escaped HTML and shared server generator verified.')
