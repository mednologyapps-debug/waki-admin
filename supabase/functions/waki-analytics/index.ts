import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.114.0';
const origins=new Set(['https://wakipe.com','https://www.wakipe.com']);
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://wakipe.com','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
 if(!origins.has(origin))return new Response(null,{status:403,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return new Response(null,{status:405,headers});
 try{
  const raw=await req.text();if(raw.length>18000)return new Response(null,{status:413,headers});
  const body=JSON.parse(raw);if(!Array.isArray(body.events)||!body.events.length||body.events.length>20)return new Response(null,{status:400,headers});
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(body.events.some((x:Record<string,unknown>)=>!uuid.test(String(x.id))||!uuid.test(String(x.session_id))))return new Response(null,{status:400,headers});
  // Gateway validates JWT; ingest RPC is service-only. Raw addresses never leave this function.
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  const hour=new Date().toISOString().slice(0,13);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(hour+'|'+ip));
  const bucket=Array.from(new Uint8Array(signed)).map(x=>x.toString(16).padStart(2,'0')).join('');
  const service=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await service.rpc('waki_ingest_web_events',{p_bucket:bucket,p_events:body.events});
  return new Response(null,{status:error?400:data?.accepted?204:429,headers});
 }catch{return new Response(null,{status:400,headers})}
});
