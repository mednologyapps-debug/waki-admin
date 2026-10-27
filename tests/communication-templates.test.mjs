import {communicationTemplate} from '../supabase/functions/waki-communications/templates.js';
import assert from 'node:assert/strict';
const t=communicationTemplate({kind:'reservation_confirmed',audience:'hotel',reservation_id:'123',payload:{hotel_name:'<script>alert(1)</script>',booking_code:'WAKI-123',start_at:'2026-10-27T20:00:00Z',end_at:'2026-10-27T22:00:00Z',amount:150}});
assert.ok(t.html.includes('&lt;script&gt;'));assert.ok(!t.html.includes('<script>'));assert.ok(t.html.includes('/reservas/123'));assert.ok(!t.html.includes('qr_token'));
const user=communicationTemplate({kind:'reservation_confirmed',audience:'user',payload:{hotel_name:'Hotel'}});assert.ok(!user.html.includes('Ver en mi portal'));console.log('Email templates: HTML escaped, reservation route, no QR secret, distinct hotel/user calls to action passed.');
