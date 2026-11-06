// Mailjet v3.1: send an audited payout confirmation with its existing PDF attachment.
// Provider acceptance is not proof of inbox delivery.
export async function sendMailjetPayout({apiKey,secretKey,recipient,subject,text,html,filename,attachmentBase64,fromAddress,fromName='WAKI',payoutId,fetcher=fetch}){
 const sender=String(fromAddress||'').match(/<([^<>]+)>/)?.[1]||String(fromAddress||'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender))throw new Error('INVALID_SENDER');
 const payload={Messages:[{
   From:{Email:sender,Name:fromName},
   To:[{Email:recipient}],
   Subject:subject,
   TextPart:text,
   HTMLPart:html,
   CustomID:'waki-payout-'+payoutId,
   Attachments:[{ContentType:'application/pdf',Filename:filename,Base64Content:attachmentBase64}]
 }]};
 const response=await fetcher('https://api.mailjet.com/v3.1/send',{
   method:'POST',
   headers:{Authorization:'Basic '+btoa(apiKey+':'+secretKey),'Content-Type':'application/json'},
   body:JSON.stringify(payload),
   signal:AbortSignal.timeout(20000)
 });
 let data=null;
 try{data=await response.json()}catch{/* Unexpected body: do not auto retry. */}
 const item=data?.Messages?.[0];
 if(response.ok&&item?.Status==='success'&&item.To?.length){
   return {state:'sent',error_code:'',message_id:String(item.To[0]?.MessageUUID||item.To[0]?.MessageID||'')};
 }
 const unknown=response.status===429||response.status>=500||(response.ok&&!item);
 return {state:unknown?'unknown':'failed',error_code:'MAILJET_HTTP_'+response.status,message_id:''};
}
