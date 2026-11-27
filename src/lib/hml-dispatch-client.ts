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
