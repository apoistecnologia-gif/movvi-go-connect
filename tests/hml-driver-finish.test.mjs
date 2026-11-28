import {describe,expect,test} from "bun:test";
import {createHmlFinishClient} from "../src/lib/hml-driver-finish.ts";
const id="00000000-0000-4000-8000-000000000001",next="00000000-0000-4000-8000-000000000002";
const ok=(queueAction="none",queueRideId=null)=>({status:200,body:{ok:true,rideId:id,state:"finalizada",queueAction,queueRideId}});
describe("operational finish",()=>{
 test("confirmed response, including next queued ride",async()=>{
  for(const result of [ok(),ok("promoted",next),ok("released",next)]){
   let sent=0;const finish=createHmlFinishClient(async r=>{expect(r).toBe(id);sent++;return result},async()=>"em_viagem");
   await finish(id);expect(sent).toBe(1);
  }
 });
 test("already finished and unauthorized state never send",async()=>{
  let sent=0;const send=async()=>{sent++;return ok()};
  await createHmlFinishClient(send,async()=>"finalizada")(id);
  await expect(createHmlFinishClient(send,async()=>null)(id)).rejects.toThrow();
  expect(sent).toBe(0);
 });
 test("lost response reconciles without repeating mutation",async()=>{
  let sent=0,reads=0;const finish=createHmlFinishClient(async()=>{sent++;throw Error("lost response")},async()=>++reads===1?"em_viagem":"finalizada");
  await finish(id);expect(sent).toBe(1);expect(reads).toBe(2);
 });
 test("invalid response or unconfirmed state fails closed",async()=>{
  let sent=0;const finish=createHmlFinishClient(async()=>{sent++;return ok("promoted",id)},async()=>"em_viagem");
  await expect(finish(id)).rejects.toThrow("Finalização não confirmada");expect(sent).toBe(1);
 });
 test("concurrent click cannot issue a second mutation",async()=>{
  let release;const gate=new Promise(r=>{release=r});let sent=0;
  const finish=createHmlFinishClient(async()=>{sent++;return ok()},async()=>{await gate;return "em_viagem"});
  const pending=finish(id);await expect(finish(id)).rejects.toThrow();release();await pending;expect(sent).toBe(1);
 });
});
