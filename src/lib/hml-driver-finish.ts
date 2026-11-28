import {uuid,exact} from "./hml-mobile-transport";
type Result={status:number;body:Record<string,unknown>};
export function createHmlFinishClient(send:(rideId:string)=>Promise<Result>,recover:(rideId:string)=>Promise<string|null>){
 let finishing=false;
 return async(rideId:string)=>{
  if(!uuid(rideId)||finishing)throw Error("Aguarde a confirmação da finalização.");
  finishing=true;
  try{
   const state=await recover(rideId);
   if(state==="finalizada")return;
   if(state!=="em_viagem")throw Error("Corrida não disponível para finalização.");
   try{
    const {status,body:b}=await send(rideId);
    if(status===200&&exact(b,["ok","rideId","state","queueAction","queueRideId"])&&b.ok===true&&b.rideId===rideId&&b.state==="finalizada"&&["none","promoted","released"].includes(String(b.queueAction))&&(b.queueAction==="none"?b.queueRideId===null:uuid(b.queueRideId)&&b.queueRideId!==rideId))return;
   }catch{/* reconcile; never repeat an uncertain mutation automatically */}
   if(await recover(rideId)==="finalizada")return;
   throw Error("Finalização não confirmada. Atualize a corrida antes de tentar novamente.");
  }finally{finishing=false;}
 };
}
