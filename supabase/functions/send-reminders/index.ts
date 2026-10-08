// Server-only. Configure VAPID and CRON_SECRET in Supabase secrets, never in frontend env.
import {createClient} from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import {timingSafeEqual} from 'node:crypto';
const secret=Deno.env.get('CRON_SECRET')??'';
Deno.serve(async req=>{
 const received=req.headers.get('x-cron-secret')??'';
 if(req.method!=='POST'||!secret||secret.length!==received.length||!timingSafeEqual(new TextEncoder().encode(secret),new TextEncoder().encode(received)))return new Response('Unauthorized',{status:401});
 const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),subject=Deno.env.get('VAPID_SUBJECT');
 if(!publicKey||!privateKey||!subject)return new Response('Push sender is not configured',{status:503});
 webpush.setVapidDetails(subject,publicKey,privateKey);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {data:subscriptions,error}=await db.from('push_subscriptions').select('*').is('deleted_at',null);
 if(error)return new Response('Database unavailable',{status:503});
 let sent=0,failed=0;
 for(const subscription of subscriptions??[]){
  // Accept only known browser push services; never send to arbitrary user-provided hosts.
  const endpoint=(()=>{try{return new URL(subscription.endpoint);}catch{return null;}})();
  if(!endpoint||endpoint.protocol!=='https:'||subscription.subscription?.endpoint!==subscription.endpoint||!['fcm.googleapis.com','push.services.mozilla.com','push.apple.com','notify.windows.com'].some(host=>endpoint.hostname===host||endpoint.hostname.endsWith('.'+host))){failed++;continue;}
  const {data:profile}=await db.from('profiles').select('preferences').eq('owner_id',subscription.owner_id).maybeSingle();
  const prefs=profile?.preferences;if(!prefs?.reminders)continue;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:prefs.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  const day=`${parts.year}-${parts.month}-${parts.day}`;
  if(subscription.last_sent_day===day||Number(parts.hour)<(prefs.reminderHour??9))continue;
  const {data:states}=await db.from('review_state').select('node_id,state').eq('owner_id',subscription.owner_id);
  const {data:nodes}=await db.from('nodes').select('id,parent_id,archived,deleted_at').eq('owner_id',subscription.owner_id);
  const isActive=(id:string):boolean=>{const seen=new Set<string>();let current:string|null=id;while(current){if(seen.has(current))return false;seen.add(current);const n=nodes?.find(n=>n.id===current);if(!n||n.archived||n.deleted_at)return false;current=n.parent_id;}return true;};
  const count=states?.filter(s=>s.state.enabled&&s.state.due&&s.state.due<=day&&isActive(s.node_id)).length??0;if(!count)continue;
  try{await webpush.sendNotification(subscription.subscription,JSON.stringify({title:'Tu plan de hoy · OpoPlan',body:`Tienes ${count} bloque(s) pendientes de repaso.`}),{TTL:3600});await db.from('push_subscriptions').update({last_sent_day:day,updated_at:new Date().toISOString(),version:subscription.version+1}).eq('owner_id',subscription.owner_id).eq('id',subscription.id);sent++;}
  catch(error){failed++;const status=(error as {statusCode?:number}).statusCode;if(status===404||status===410)await db.from('push_subscriptions').update({deleted_at:new Date().toISOString(),version:subscription.version+1}).eq('owner_id',subscription.owner_id).eq('id',subscription.id);}
 }
 return Response.json({sent,failed});
});
