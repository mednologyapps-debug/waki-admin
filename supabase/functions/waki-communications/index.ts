import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.114.0';
import nodemailer from 'npm:nodemailer@10.1.1';
import {communicationTemplate} from './templates.js';
import {sendMailjet} from './mailjet.js';
const origins=new Set(['https://admin.wakipe.com','http://localhost:5173','http://127.0.0.1:5173']);
const corsFor=(req:Request)=>({
 'Access-Control-Allow-Origin':origins.has(req.headers.get('origin')||'')?req.headers.get('origin')!:'https://admin.wakipe.com',
 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
 'Access-Control-Allow-Methods':'POST,OPTIONS',
 'Cache-Control':'no-store','Vary':'Origin'
});
Deno.serve(async req=>{
 const cors=corsFor(req);
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 try{
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const schedulerToken=req.headers.get('x-waki-scheduler-token')||'';
 let scheduled=false;
 if(/^[a-f0-9]{64}$/.test(schedulerToken)){
  const {data:verification,error:verifyError}=await service.rpc('waki_communication_scheduler',{p_action:'verify',p_token:schedulerToken});
  scheduled=!verifyError&&verification?.valid===true;
 }
 if(!scheduled){
  const {data:auth,error}=await service.auth.getUser(token);if(error||!auth.user)return reply({error:'AUTH_REQUIRED'},401);
  const {data:actor}=await service.from('profiles').select('role,account_status').eq('id',auth.user.id).single();
  if(!actor||actor.account_status!=='active'||!['admin','super_admin'].includes(actor.role))return reply({error:'NOT_AUTHORIZED'},403);
 }
 const mailjetKey=Deno.env.get('MAILJET_API_KEY'),mailjetSecret=Deno.env.get('MAILJET_SECRET_KEY');
 const resend=Deno.env.get('RESEND_API_KEY');const host=Deno.env.get('SMTP_HOST'),user=Deno.env.get('SMTP_USER'),pass=Deno.env.get('SMTP_PASS');
 const provider=mailjetKey&&mailjetSecret?'mailjet':resend?'resend':host&&user&&pass?'smtp':'none';
 const configured=provider!=='none';
 const requestBody=await req.json().catch(()=>({}));
 if(requestBody?.action==='status')return reply({ok:true,configured,provider});
 if(!configured)return reply({ok:true,configured:false,provider:'none',sent:0,review:0});
 if(!scheduled){const {error:setupError}=await service.rpc('waki_communication_scheduler',{p_action:'init',p_token:Deno.env.get('SUPABASE_ANON_KEY')!});if(setupError)throw setupError;}
 const {data:rows,error}=await service.rpc('waki_communication_batch',{p_action:'claim',p_data:{}});if(error)throw error;
 let sent=0,review=0;
 async function deliver(row: Record<string, any>){
 let state='failed',code='',transport,providerMessageId='';
 try{
 const message=communicationTemplate(row),from=Deno.env.get('WAKI_FROM_EMAIL')||'WAKI <hola@wakipe.com>';
 if(provider==='mailjet'){
   const outcome=await sendMailjet({apiKey:mailjetKey!,secretKey:mailjetSecret!,row,message,
     fromAddress:from,fromName:Deno.env.get('WAKI_FROM_NAME')||'WAKI'});
   state=outcome.state;code=outcome.error_code;providerMessageId=outcome.provider_message_id;
 }else if(provider==='resend'){
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json','Idempotency-Key':'waki-notice-'+row.id},body:JSON.stringify({from,to:[row.recipient],...message}),signal:AbortSignal.timeout(15000)});
 state=response.ok?'sent':response.status>=500?'unknown':'failed';code=response.ok?'':'PROVIDER_'+response.status;
 }else{
 const port=Number(Deno.env.get('SMTP_PORT')||465);transport=nodemailer.createTransport({host,port,secure:port===465,requireTLS:port!==465,auth:{user,pass},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:12000});
 const result=await transport.sendMail({from,to:row.recipient,...message,messageId:`<waki-notice-${row.id}@wakipe.com>`});state=result.accepted?.length?'sent':'failed';code=state==='sent'?'':'RECIPIENT_REJECTED';
 }
 }catch{state='unknown';code='DELIVERY_UNCERTAIN'}finally{transport?.close()}
 const ack=await service.rpc('waki_communication_batch',{p_action:'complete',p_data:{id:row.id,lease:row.lease,state,error_code:code,provider,provider_message_id:providerMessageId}});
 if(ack.error)throw ack.error;if(state==='sent')sent++;else review++;
 }
 for(let i=0;i<(rows||[]).length;i+=2)await Promise.all(rows.slice(i,i+2).map(deliver));
 return reply({ok:true,configured:true,provider,sent,review});
 }catch{console.error('WAKI_COMMUNICATION_BATCH_FAILED');return reply({error:'BATCH_FAILED'},500)}
});
