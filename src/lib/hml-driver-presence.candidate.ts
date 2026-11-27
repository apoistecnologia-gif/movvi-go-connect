import { exact, uuid, type createHmlMobileTransport } from "./hml-mobile-transport";
// HML candidate only. The native service and UI must share one writer before
// activation. No legacy RPC, fabricated GPS, token storage, or mutation retries.
type Transport = ReturnType<typeof createHmlMobileTransport>;
type Status = {generation:string|null;sequence:number;closed:boolean;owned:boolean;online:boolean};
type Fix = {capturedAt:number;lat:number;lng:number;heading:number|null;speed:number|null};
type Mutation = {generation:string;sequence:number;online:boolean};
const finite=(x:unknown,min:number,max:number):x is number=>typeof x==="number"&&Number.isFinite(x)&&x>=min&&x<=max;
function validFix(f:Fix,now:number){
 return Number.isSafeInteger(f.capturedAt)&&f.capturedAt>=now-45000&&f.capturedAt<=now+5000&&finite(f.lat,-34,6)&&finite(f.lng,-74,-32)&&
  (f.heading===null||(finite(f.heading,0,360)&&f.heading<360))&&(f.speed===null||finite(f.speed,0,100));
}
export function createHmlPresenceClient(send:Transport,now=Date.now){
 let generation:string|null=null,sequence=0,lastCapturedAt:number|null=null,ambiguous=false,desired=false,busy=false,invalidated=false;
 function assertLive(){if(invalidated)throw Error("presence_client_invalidated");}
 async function exclusive<T>(run:()=>Promise<T>):Promise<T>{
  assertLive();if(busy)throw Error("presence_busy");
  busy=true;try{return await run();}finally{busy=false;}
 }
 async function readStatus(signal?:AbortSignal):Promise<Status>{
  assertLive();const {status,body:b}=await send("driver",{action:"presence_status"},signal);assertLive();
  if(status!==200||!exact(b,["ok","generation","sequence","closed","owned","online"])||b.ok!==true||
    !(b.generation===null||uuid(b.generation))||!Number.isSafeInteger(b.sequence)||Number(b.sequence)<0||
    typeof b.closed!=="boolean"||typeof b.owned!=="boolean"||typeof b.online!=="boolean"||
    (b.generation===null&&(b.sequence!==0||!b.closed||b.owned||b.online))||(b.closed&&b.online))throw Error("presence_status_unavailable");
  return {generation:b.generation,sequence:Number(b.sequence),closed:b.closed,owned:b.owned,online:b.online};
 }
 async function mutate(payload:Record<string,unknown>,signal?:AbortSignal):Promise<Mutation>{
  assertLive();ambiguous=true;
  const {status,body:b}=await send("driver",payload,signal);assertLive();
  if(status!==200||!exact(b,["ok","generation","sequence","online"])||b.ok!==true||!uuid(b.generation)||
    !Number.isSafeInteger(b.sequence)||typeof b.online!=="boolean")throw Error("presence_unconfirmed");
  const begin=payload.action==="presence_begin";
  if(begin?(b.generation===payload.expectedGeneration||b.sequence!==0||b.online):
    (b.generation!==payload.generation||b.sequence!==payload.sequence||b.online!==(payload.action==="presence_fix")))throw Error("presence_unconfirmed");
  ambiguous=false;
  return {generation:b.generation,sequence:Number(b.sequence),online:b.online};
 }
 return Object.freeze({
  status:(signal?:AbortSignal)=>exclusive(()=>readStatus(signal)),
  // An explicit user action starts a new generation; status is never itself
  // permission to start or silently replace another session.
  begin:(signal?:AbortSignal)=>exclusive(async()=>{
   desired=false;const prior=await readStatus(signal);assertLive();
   const next=await mutate({action:"presence_begin",expectedGeneration:prior.generation},signal);
   assertLive();generation=next.generation;sequence=next.sequence;lastCapturedAt=null;desired=true;return next;
  }),
  fix:(fix:Fix,signal?:AbortSignal)=>exclusive(async()=>{
   if(!desired||ambiguous||!generation)throw Error("presence_reconciliation_required");
   if(!validFix(fix,now())||(lastCapturedAt!==null&&fix.capturedAt<=lastCapturedAt))throw Error("presence_invalid_fix");
   if(sequence>=Number.MAX_SAFE_INTEGER)throw Error("presence_sequence_exhausted");
   const next=await mutate({action:"presence_fix",generation,sequence:sequence+1,capturedAt:fix.capturedAt,lat:fix.lat,lng:fix.lng,heading:fix.heading,speed:fix.speed},signal);
   assertLive();sequence=next.sequence;lastCapturedAt=fix.capturedAt;return next;
  }),
  // If a previous response was lost, a new read must precede the offline
  // command. Never send an OFFLINE command against another session.
  offline:(signal?:AbortSignal)=>exclusive(async()=>{
   desired=false;
   const prior=await readStatus(signal);assertLive();
   if(!prior.generation||prior.closed||!prior.owned){generation=null;sequence=0;lastCapturedAt=null;ambiguous=false;return {confirmedOffline:!prior.online};}
   if(generation===null||prior.generation!==generation)throw Error("presence_generation_changed");
   if(prior.sequence>=Number.MAX_SAFE_INTEGER)throw Error("presence_sequence_exhausted");
   await mutate({action:"presence_offline",generation:prior.generation,sequence:prior.sequence+1},signal);
   assertLive();generation=null;sequence=0;lastCapturedAt=null;ambiguous=false;return {confirmedOffline:true};
  }),
  // Invalidation never performs a network write with the next user's token.
  invalidate(){invalidated=true;desired=false;generation=null;sequence=0;lastCapturedAt=null;ambiguous=true;},
 });
}
