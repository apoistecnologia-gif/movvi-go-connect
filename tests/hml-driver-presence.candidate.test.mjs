import {describe,expect,test} from "bun:test";
import {createHmlPresenceClient} from "../src/lib/hml-driver-presence.candidate.ts";
const g="00000000-0000-4000-8000-000000000002",g2="00000000-0000-4000-8000-000000000003",now=1795820000000;
const empty={ok:true,generation:null,sequence:0,closed:true,owned:false,online:false};
const fresh={capturedAt:now-1000,lat:-9.39,lng:-40.5,heading:null,speed:0};
function fixture(){
 const calls=[];let state=empty;let fail=false;
 const send=async(endpoint,body)=>{
  expect(endpoint).toBe("driver");calls.push(body);
  if(body.action==="presence_status")return {status:200,body:state};
  if(body.action==="presence_begin"){state={ok:true,generation:state.generation===g?g2:g,sequence:0,closed:false,owned:true,online:false};}
  if(body.action==="presence_fix"){state={...state,sequence:body.sequence,online:true};}
  if(body.action==="presence_offline"){state={...state,sequence:body.sequence,closed:true,online:false};}
  if(fail){fail=false;throw Error("lost response");}
  return {status:200,body:{ok:true,generation:state.generation,sequence:state.sequence,online:state.online}};
 };
 return {calls,client:createHmlPresenceClient(send,()=>now),failNext(){fail=true;},setState(v){state=v;}};
}
describe("HML driver presence client",()=>{
 test("new generation is not online until a valid fix; cached GPS never renews",async()=>{
  const {calls,client}=fixture();
  expect((await client.begin()).online).toBe(false);
  expect((await client.fix(fresh)).online).toBe(true);
  await expect(client.fix(fresh)).rejects.toThrow("presence_invalid_fix");
  await expect(client.fix({...fresh,capturedAt:now-45001})).rejects.toThrow();
  await expect(client.fix({...fresh,capturedAt:now,lat:0,lng:0})).rejects.toThrow();
  expect(calls.length).toBe(3);
  expect(await client.offline()).toEqual({confirmedOffline:true});
  await expect(client.fix({...fresh,capturedAt:now})).rejects.toThrow();
 });
 test("lost mutation response is not automatically repeated; offline uses read reconciliation",async()=>{
  const f=fixture();await f.client.begin();f.failNext();
  await expect(f.client.fix(fresh)).rejects.toThrow();
  await expect(f.client.fix({...fresh,capturedAt:now})).rejects.toThrow("presence_reconciliation_required");
  expect(f.calls.filter(c=>c.action==="presence_fix").length).toBe(1);
  expect(await f.client.offline()).toEqual({confirmedOffline:true});
  expect(f.calls.at(-1).sequence).toBe(2);
 });
 test("never take another generation offline and never send after invalidation",async()=>{
  const f=fixture();await f.client.begin();
  f.setState({ok:true,generation:g2,sequence:1,closed:false,owned:false,online:true});
  expect(await f.client.offline()).toEqual({confirmedOffline:false});
  expect(f.calls.filter(c=>c.action==="presence_offline").length).toBe(0);
  f.client.invalidate();
  await expect(f.client.fix(fresh)).rejects.toThrow();
 });
});
