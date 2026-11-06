const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const titles={reservation_confirmed:'Tu reserva está confirmada',reservation_cancelled:'Actualización de tu reserva',extension_confirmed:'Tu ampliación está confirmada',hotel_approved:'Tu hotel ya es parte de WAKI',hotel_rejected:'Tenemos observaciones sobre tu hotel',hotel_pending_review:'Recibimos tu hotel para revisión'};
export function communicationTemplate(row){
 if(row.kind==='hotel_invitation'){
  const p=row.payload||{};
  const name=String(p.hotel_name||'tu hotel').trim();
  const representative=String(p.representative_name||'').trim();
  // Token URL is generated server-side only, never from user form fields.
  const link=String(p.invitation_url||'');
  if(!/^https:\/\/(?:hotel\.wakipe\.com\/invitacion|ventas\.wakipe\.com\/hotel\/invitacion)\/[0-9a-f-]{36}$/.test(link)){
    throw new Error('INVALID_HOTEL_INVITE_URL');
  }
  const text=['Hola'+(representative?' '+representative:'' )+',',
    'Tienes una invitación para registrar '+name+' en WAKI Hotel.',
    'Activa tu acceso desde este enlace (válido durante 14 días): '+link,
    'Completarás tu información y confirmarás tu correo antes de ingresar.',
    'El hotel no se publicará hasta que WAKI lo revise y apruebe.',
    'Si no esperabas esta invitación, ignora el mensaje. Soporte: soporte@wakipe.com'].join('\n\n');
  const logo='https://raw.githubusercontent.com/mednologyapps-debug/waki-web/main/public/brand/waki-logo-email.png';
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f5f2fc;font-family:Arial,Helvetica,sans-serif;color:#30233f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f2fc"><tr><td align="center" style="padding:36px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:white;border-radius:22px"><tr><td align="center" style="padding:26px 24px;background:#f6f2ff;border-radius:22px 22px 0 0"><img src="${logo}" alt="WAKI" width="225" style="display:block;width:225px;max-width:100%;height:auto;border:0"></td></tr><tr><td style="padding:32px 30px"><h1 style="margin:0 0 16px;font-size:25px;line-height:1.25;color:#30233f">Tu hotel está invitado a WAKI</h1><p style="font-size:15px;line-height:1.65;color:#5c526b">Hola ${escape(representative||'')},</p><p style="font-size:15px;line-height:1.65;color:#5c526b">Queremos dar la bienvenida a <strong>${escape(name)}</strong>. Completa tu registro para administrar tu hotel desde WAKI Hotel.</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0"><tr><td style="background:#7137e8;border-radius:12px"><a href="${escape(link)}" style="display:inline-block;padding:15px 26px;color:#fff;font-weight:bold;text-decoration:none;font-size:15px">Registrar mi hotel</a></td></tr></table><p style="font-size:14px;line-height:1.65;color:#716681">El enlace vence en 14 días. Tu establecimiento permanecerá sin publicar hasta finalizar la configuración y superar la revisión de WAKI.</p><p style="font-size:12px;line-height:1.6;color:#817590">Si no solicitaste esta invitación, puedes ignorarla. WAKI nunca te pedirá tu contraseña por correo.</p><p style="font-size:12px;color:#817590">¿Necesitas ayuda? <a href="mailto:soporte@wakipe.com" style="color:#7137e8">soporte@wakipe.com</a></p></td></tr></table></td></tr></table></body></html>`;
  return {subject:'WAKI Hotel · Activa el acceso de '+name,text,html};
 }
 if(row.kind==='mail_test'){
  const title='Prueba de correo WAKI';
  const text='Esta es una prueba solicitada desde el panel global de WAKI. Si recibes este mensaje, el proveedor aceptó el envío y el correo llegó a esta cuenta. No respondas a este aviso.';
  const html='<html lang="es"><body style="font-family:Arial,sans-serif;background:#f7f3fe;padding:32px;color:#30233f"><div style="max-width:540px;margin:auto;padding:32px;border-radius:20px;background:#fff"><h1 style="color:#7137e8">WAKI</h1><h2>'+title+'</h2><p>'+text+'</p><p style="font-size:12px;color:#776985">No se realizó ninguna reserva ni cobro.</p></div></body></html>';
  return {subject:'WAKI · '+title,text,html};
 }

 const p=row.payload||{};const title=row.audience==='hotel'&&row.kind==='reservation_confirmed'?'Tienes una nueva reserva WAKI':titles[row.kind]||'Novedades de WAKI';
 const date=v=>v?new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—';
 const details=[['Hotel',p.hotel_name],['Reserva',p.booking_code],['Inicio',p.start_at&&date(p.start_at)],['Salida',p.end_at&&date(p.end_at)],['Total',p.amount!=null?`${p.currency||'PEN'} ${Number(p.amount).toFixed(2)}`:null]].filter(([,v])=>v);
 const isHotel=row.audience==='hotel';const url=isHotel?(row.reservation_id?`https://hotel.wakipe.com/reservas/${encodeURIComponent(row.reservation_id)}`:'https://hotel.wakipe.com/revision'):'https://wakipe.com/';
 const intro=row.kind==='hotel_rejected'?'Revisa las observaciones y actualiza tu información desde el portal. La publicación requiere la aprobación de WAKI.':row.kind==='hotel_pending_review'?'Nuestro equipo revisará tu información y te avisará el resultado. Tu hotel todavía no está publicado.':row.kind==='reservation_cancelled'?'El estado de la reserva cambió a cancelada. Consulta soporte para conocer cualquier devolución aplicable.':isHotel?'Entra a tu portal para revisar todos los detalles.':'Ya está listo tu próximo momento. Encuentra tu confirmación y tu QR en la aplicación WAKI.';
 const text=[title,intro,...details.map(([k,v])=>`${k}: ${v}`),p.reason?`Observación: ${p.reason}`:'',isHotel?`Ver en el portal: ${url}`:'Abre WAKI para consultar tu reserva.','Soporte: soporte@wakipe.com'].filter(Boolean).join('\n');
 const html=`<!doctype html><html lang="es"><body style="margin:0;background:#f6f3fc;font-family:Arial,sans-serif;color:#30233f"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:white;border-radius:24px"><tr><td style="padding:32px"><img src="https://wakipe.com/brand/logo.webp" alt="WAKI" width="112" style="display:block;max-width:100%"><h1 style="font-size:26px;line-height:1.2;margin:28px 0 12px">${escape(title)}</h1><p style="line-height:1.65;color:#776985">${escape(intro)}</p><table role="presentation" width="100%" style="border-radius:16px;background:#f7f3fe;padding:16px">${details.map(([k,v])=>`<tr><td style="padding:7px;font-size:13px;color:#776985">${escape(k)}</td><td style="padding:7px;font-size:13px;font-weight:bold">${escape(v)}</td></tr>`).join('')}</table>${p.reason?`<p style="line-height:1.6">${escape(p.reason)}</p>`:''}${isHotel?`<p style="margin:28px 0"><a href="${url}" style="display:inline-block;background:#7137e8;color:white;border-radius:12px;padding:14px 22px;text-decoration:none;font-weight:bold">Ver en mi portal</a></p>`:''}<p style="font-size:12px;line-height:1.6;color:#776985">¿Necesitas ayuda? <a href="mailto:soporte@wakipe.com" style="color:#7137e8">Escríbenos</a>.</p><p style="font-size:11px;color:#998ca6">Aviso operativo de WAKI. Nunca te pediremos tu contraseña ni datos completos de tarjeta por correo.</p></td></tr></table></td></tr></table></body></html>`;
 return {subject:'WAKI · '+title,text,html};
}
