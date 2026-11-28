import {createHmlFinishClient} from "./hml-driver-finish";
import {supabase} from "@/integrations/supabase/client";
import {createHmlMobileTransport,HML_ORIGIN,uuid,exact} from "./hml-mobile-transport";
export const isHmlDispatch = import.meta.env.VITE_SUPABASE_URL === HML_ORIGIN;
const request=()=>createHmlMobileTransport({origin:import.meta.env.VITE_SUPABASE_URL,session:async()=>{
 const {data,error}=await supabase.auth.getSession();
 return error?null:data.session;
}});
type Action="arrive"|"start"|"cancel"|"reject";
export async function hmlDriverStage(action:Action,rideId:string,extra?:string){
 if(!isHmlDispatch||!uuid(rideId))throw Error("Corrida inválida para homologação.");
 const payload:Record<string,unknown>={action,rideId};
 if(action==="start"){if(!/^\d{4}$/.test(extra??""))throw Error("Informe os quatro dígitos do PIN.");payload.pin=extra;}
 if(action==="cancel"){const reason=(extra??"").trim();if(reason.length<3||reason.length>240||/[\u0000-\u001f\u007f-\u009f]/.test(reason))throw Error("Informe o motivo do cancelamento.");payload.reason=reason;}
 const result=await request()("driver",payload).catch(()=>{throw Error("Resposta não confirmada. Atualize a corrida antes de repetir a ação.");});
 const b=result.body;
 if(result.status===401||result.status===403)throw Error("Sessão ou autorização indisponível.");
 if(action==="start"&&result.status===409&&b.error_code==="invalid_pin")throw Error("PIN incorreto.");
 if(action==="start"&&result.status===409&&b.error_code==="pin_locked")throw Error("PIN temporariamente bloqueado.");
 if(result.status!==200||b.ok!==true||b.rideId!==rideId)throw Error("A ação não foi confirmada. Atualize a corrida.");
 if(action==="reject"){
  if(!exact(b,["ok","rideId","action","offered"])||!["offered","offer_still_active","no_candidate_yet","expired"].includes(String(b.action))||!Number.isInteger(b.offered)||Number(b.offered)<0||Number(b.offered)>5)throw Error("Resposta inválida.");
 }else{
  const expected={arrive:"motorista_chegou",start:"em_viagem",cancel:"procurar_motorista"}[action];
  if(!exact(b,["ok","rideId","state"])||b.state!==expected)throw Error("Resposta inválida.");
 }
 return b;
}

type Json=Record<string,unknown>;
type Visibility="offered"|"accepted"|"queued";
type ReadResult={ride:Json;visibility:Visibility;generation:string|null};
const object=(v:unknown):v is Json=>!!v&&typeof v==="object"&&!Array.isArray(v);
export async function readHmlDriverProfile(subject:string):Promise<Json>{
 if(!isHmlDispatch||!uuid(subject))throw Error("unauthorized");
 const {status,body:b}=await request()("driver",{action:"profile"});
 const p=b.profile;
 if(status===401||status===403)throw Error("unauthorized");
 if(status!==200||!exact(b,["ok","profile"])||b.ok!==true||!exact(p,["id","user_id","auth_user_id","category","approval_status","subscription_status","hml_test_presence_authorized","is_online","current_lat","current_lng","current_heading","current_speed","last_location_at"])||!uuid(p.id)||!uuid(p.user_id)||p.auth_user_id!==subject||typeof p.is_online!=="boolean"||typeof p.hml_test_presence_authorized!=="boolean")throw Error("profile_unavailable");
 return p;
}
export async function readHmlDriverRide(rideId:string):Promise<ReadResult>{
 if(!isHmlDispatch||!uuid(rideId))throw Error("invalid_ride");
 const {status,body:b}=await request()("driver",{action:"ride",rideId});
 if(status===401||status===403)throw Error("unauthorized");
 if(status!==200||!exact(b,["ok","visibility","generation","ride"])||b.ok!==true||!object(b.ride)||b.ride.id!==rideId||
  !["offered","accepted","queued"].includes(String(b.visibility))||
  ["security_code","passenger_id","request_key","share_token","provider_payment_id","final_price"].some(k=>Object.prototype.hasOwnProperty.call(b.ride,k)))throw Error("ride_unavailable");
 const r=b.ride;
 if(r.category!=="carros"||r.payment_method!=="cash"||
  ![r.origin_lat,r.origin_lng,r.destination_lat,r.destination_lng,r.estimated_price].every(v=>typeof v==="number"&&Number.isFinite(v))||
  typeof r.origin_name!=="string"||typeof r.destination_name!=="string")throw Error("ride_unavailable");
 const visibility=b.visibility as Visibility;
 if(visibility==="offered"?(b.generation!==null||r.driver_id!==null||r.status!=="procurar_motorista"||typeof r.request_expires_at!=="string"||!Number.isFinite(Date.parse(r.request_expires_at))):
  (!uuid(b.generation)||!uuid(r.driver_id)||(visibility==="queued"?(r.status!=="procurar_motorista"||!uuid(r.queued_after_ride_id)):!["motorista_a_caminho","motorista_chegou","em_viagem"].includes(String(r.status)))))throw Error("ride_unavailable");
 return {ride:r,visibility,generation:typeof b.generation==="string"?b.generation:null};
}
export async function listHmlDriverRides():Promise<ReadResult[]>{
 if(!isHmlDispatch)throw Error("invalid_hml");
 const {status,body:b}=await request()("driver",{action:"discover"});
 if(status!==200||!exact(b,["ok","rides"])||b.ok!==true||!Array.isArray(b.rides)||b.rides.length>10)throw Error("ride_unavailable");
 const ids=b.rides.map(v=>{if(!exact(v,["rideId","state"])||!uuid(v.rideId)||!["offered","accepted","queued"].includes(String(v.state)))throw Error("ride_unavailable");return v.rideId;});
 if(new Set(ids).size!==ids.length)throw Error("ride_unavailable");
 // Sequential read protects the bounded backend request pool.
 const rows:ReadResult[]=[];
 for(const id of ids){try{rows.push(await readHmlDriverRide(id));}catch(e){if(!(e instanceof Error)||e.message!=="unauthorized")throw e;}}
 return rows;
}
export async function recoverHmlDriverState(rideId:string):Promise<string|null>{
 if(!isHmlDispatch||!uuid(rideId))throw Error("invalid_ride");
 const {status,body:b}=await request()("driver",{action:"recover",rideId});
 if(status!==200||!exact(b,["ok","rides"])||b.ok!==true||!Array.isArray(b.rides)||b.rides.length>1)throw Error("ride_unavailable");
 if(!b.rides.length)return null;
 const r=b.rides[0];
 if(!exact(r,["rideId","state"])||r.rideId!==rideId||!["motorista_a_caminho","motorista_chegou","em_viagem","queued","finalizada","cancelada_motorista","cancelada_passageiro","released"].includes(String(r.state)))throw Error("ride_unavailable");
 return String(r.state);
}
let accepting=false;
export async function acceptHmlDriverRide(rideId:string){
 if(!isHmlDispatch||!uuid(rideId)||accepting)throw Error("Aguarde a confirmação do aceite.");
 accepting=true;
 try{
  const {status,body:b}=await request()("driver",{action:"accept",rideId});
  if(status!==200||!exact(b,["ok","rideId","status","queued"])||b.ok!==true||b.rideId!==rideId||
    !["motorista_a_caminho","procurar_motorista"].includes(String(b.status))||typeof b.queued!=="boolean"||b.queued!==(b.status==="procurar_motorista"))throw Error("Aceite não confirmado.");
  const confirmed=await readHmlDriverRide(rideId);
  if(confirmed.visibility!==(b.queued?"queued":"accepted"))throw Error("Aceite ainda em sincronização.");
  return confirmed.ride;
 }catch{throw Error("Confirmação pendente. Aguarde a sincronização antes de repetir o aceite.");}
 finally{accepting=false;}
}

const finish=createHmlFinishClient(rideId=>request()("driver",{action:"finish_operational",rideId}),recoverHmlDriverState);
export async function finishHmlDriverRide(rideId:string){
 if(!isHmlDispatch)throw Error("Ambiente de homologação indisponível.");
 return finish(rideId);
}
