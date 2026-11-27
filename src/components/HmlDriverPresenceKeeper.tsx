import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isNativeAndroidDriverLocation,startNativeDriverLocation,stopNativeDriverLocation,updateHmlNativeToken } from "@/lib/driverNativeLocation";
import { createHmlMobileTransport,HML_ORIGIN } from "@/lib/hml-mobile-transport";
import { createHmlPresenceClient } from "@/lib/hml-driver-presence.candidate";
const EVENT="apois:driver-presence-change";
export const HML_PRESENCE_RESULT="apois:hml-driver-presence-result";
export function HmlDriverPresenceKeeper(){
 useEffect(()=>{
  let desired=false,version=0,started=false,disposed=false,polling=false,subject:string|null=null,sessionId:string|null=null;
  let chain=Promise.resolve();
  const report=(online:boolean,pending:boolean)=>window.dispatchEvent(new CustomEvent(HML_PRESENCE_RESULT,{detail:{online,pending}}));
  const identity=(token:string):string|null=>{try{const b=token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");const c=JSON.parse(atob(b+"=".repeat((4-b.length%4)%4)));return typeof c.session_id==="string"?c.session_id:null;}catch{return null;}};
  const clear=()=>{try{localStorage.setItem("apois:driver:online","0");}catch{/* no-op */}};
  clear(); // No auto online after a process restart.
  const stop=()=>{desired=false;version++;started=false;subject=null;sessionId=null;clear();report(false,false);chain=chain.catch(()=>{}).then(()=>stopNativeDriverLocation()).catch(()=>{});};
  const transport=createHmlMobileTransport({origin:HML_ORIGIN,session:async()=>{
   const {data,error}=await supabase.auth.getSession();return error?null:data.session;
  }});
  const statusClient=createHmlPresenceClient(transport);
  const onEvent=(e:Event)=>{
   if((e as CustomEvent<{online:boolean}>).detail?.online!==true){stop();return;}
   if(desired)return;
   if(!isNativeAndroidDriverLocation()){stop();return;}
   desired=true;const v=++version;report(false,true);
   chain=chain.catch(()=>{}).then(async()=>{
    if(disposed||!desired||v!==version)return;
    const {data}=await supabase.auth.getSession();
    if(!data.session||disposed||!desired||v!==version){if(v===version)stop();return;}
    subject=data.session.user.id;sessionId=identity(data.session.access_token);
    if(!sessionId){stop();return;}
    const ok=await startNativeDriverLocation(true);
    if(disposed||!desired||v!==version){if(ok)await stopNativeDriverLocation();return;}
    if(!ok){stop();return;}
    started=true;
   }).catch(()=>{if(v===version)stop();});
  };
  let firstSeen=0;
  const poll=async()=>{
   if(disposed||!desired||!started||polling)return;
   const v=version;polling=true;
   try{
    const s=await statusClient.status();
    if(disposed||!desired||v!==version)return;
    if(s.owned&&s.online&&!s.closed){firstSeen=Date.now();report(true,false);}
    else {report(false,true);if(!firstSeen)firstSeen=Date.now();else if(Date.now()-firstSeen>20000)stop();}
   }catch{if(v===version){report(false,true);if(!firstSeen)firstSeen=Date.now();else if(Date.now()-firstSeen>20000)stop();}}
   finally{polling=false;}
  };
  const {data:listener}=supabase.auth.onAuthStateChange((event,s)=>{
   if(!desired)return;
   if(event==="SIGNED_OUT"||!s||s.user.id!==subject||identity(s.access_token)!==sessionId){stop();return;}
   if(event==="TOKEN_REFRESHED"&&started){const v=version;chain=chain.catch(()=>{}).then(async()=>{if(!disposed&&desired&&v===version)await updateHmlNativeToken(s.access_token);}).catch(()=>{if(v===version)stop();});}
  });
  const timer=window.setInterval(()=>{if(!desired)firstSeen=0;else void poll();},4000);
  window.addEventListener(EVENT,onEvent);
  return()=>{disposed=true;window.clearInterval(timer);window.removeEventListener(EVENT,onEvent);listener.subscription.unsubscribe();statusClient.invalidate();stop();};
 },[]);
 return null;
}
