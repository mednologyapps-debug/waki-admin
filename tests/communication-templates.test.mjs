import {communicationTemplate} from '../supabase/functions/waki-communications/templates.js';
import assert from 'node:assert/strict';
const t=communicationTemplate({kind:'reservation_confirmed',audience:'hotel',reservation_id:'123',payload:{hotel_name:'<script>alert(1)</script>',booking_code:'WAKI-123',start_at:'2026-10-27T20:00:00Z',end_at:'2026-10-27T22:00:00Z',amount:150}});
assert.ok(t.html.includes('&lt;script&gt;'));assert.ok(!t.html.includes('<script>'));assert.ok(t.html.includes('/reservas/123'));assert.ok(!t.html.includes('qr_token'));
const user=communicationTemplate({kind:'reservation_confirmed',audience:'user',payload:{hotel_name:'Hotel'}});assert.ok(!user.html.includes('Ver en mi portal'));console.log('Email templates: HTML escaped, reservation route, no QR secret, distinct hotel/user calls to action passed.');


import { mailjetPayload, sendMailjet } from '../supabase/functions/waki-communications/mailjet.js';

const row = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', recipient: 'qa@example.com' };
const mail = communicationTemplate({kind:'mail_test',audience:'user',payload:{}});
const body = mailjetPayload(row,mail,'WAKI <notificaciones@wakipe.com>');
assert.equal(body.Messages[0].From.Email,'notificaciones@wakipe.com');
assert.equal(body.Messages[0].To[0].Email,row.recipient);
assert.equal(body.Messages[0].CustomID,'waki-notice-'+row.id);
assert.equal(body.Messages[0].TextPart,mail.text);
assert.equal(body.Messages[0].HTMLPart,mail.html);
assert.throws(()=>mailjetPayload({...row,recipient:'bad-address'},mail,'notificaciones@wakipe.com'),/INVALID_RECIPIENT/);

const send = async(fetcher)=>sendMailjet({
 apiKey:'public-test-key',secretKey:'private-test-key',
 row,message:mail,fromAddress:'notificaciones@wakipe.com',fetcher
});
const accepted = await send(async(url,init)=>{
 assert.equal(url,'https://api.mailjet.com/v3.1/send');
 assert.equal(init.method,'POST');
 assert.equal(init.headers.Authorization,'Basic '+btoa('public-test-key:private-test-key'));
 assert.equal(JSON.parse(init.body).Messages[0].CustomID,'waki-notice-'+row.id);
 return Response.json({Messages:[{Status:'success',To:[{Email:row.recipient,MessageUUID:'test-uuid',MessageID:1234}]}]});
});
assert.deepEqual(accepted,{state:'sent',error_code:'',provider_message_id:'test-uuid'});
const invalidKey = await send(async()=>Response.json({ErrorMessage:'Unauthorized'},{status:401}));
assert.equal(invalidKey.state,'failed');
assert.equal(invalidKey.error_code,'MAILJET_HTTP_401');
const transient = await send(async()=>Response.json({ErrorMessage:'Busy'},{status:503}));
assert.equal(transient.state,'unknown');
const malformed = await send(async()=>Response.json({foo:'bar'}));
assert.equal(malformed.state,'unknown');
console.log('Mailjet API: payload, HTTP Basic auth, provider receipt, errors and unknown states passed.');

import { sendMailjetPayout } from '../supabase/functions/admin-payout/mailjet-payout.js';
const payout = {
 apiKey:'public-test-key',secretKey:'private-test-key',
 recipient:'hotel@example.com',subject:'Liquidación de prueba',text:'Comprobante',
 html:'<p>Comprobante</p>',filename:'test.pdf',attachmentBase64:'UERG',
 fromAddress:'WAKI <notificaciones@wakipe.com>',payoutId:'cccccccc-cccc-cccc-cccc-cccccccccccc'
};
const payoutResult = await sendMailjetPayout({...payout,fetcher:async(url,opts)=>{
 assert.equal(url,'https://api.mailjet.com/v3.1/send');
 const m=JSON.parse(opts.body).Messages[0];
 assert.equal(m.From.Email,'notificaciones@wakipe.com');
 assert.equal(m.To[0].Email,'hotel@example.com');
 assert.equal(m.Attachments[0].ContentType,'application/pdf');
 assert.equal(m.Attachments[0].Base64Content,'UERG');
 assert.equal(m.CustomID,'waki-payout-'+payout.payoutId);
 return Response.json({Messages:[{Status:'success',To:[{MessageUUID:'payout-uuid'}]}]});
}});
assert.equal(payoutResult.state,'sent');
assert.equal(payoutResult.message_id,'payout-uuid');
const payoutUnauthorized=await sendMailjetPayout({...payout,fetcher:async()=>Response.json({ErrorMessage:'Unauthorized'},{status:401})});
assert.equal(payoutUnauthorized.state,'failed');
console.log('Mailjet payout PDF: formatted attachment, sender and provider receipt passed.');
