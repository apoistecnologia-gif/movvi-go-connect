/* global Deno */

function assertIncludes(source: string, expected: string, label: string): void {
  if (!source.includes(expected)) throw new Error(`${label}: missing ${expected}`);
}

Deno.test("Driver push offer follows the 30-second mobile contract", async () => {
  const dispatch = await Deno.readTextFile("supabase/functions/dispatch-ride/index.ts");
  const push = await Deno.readTextFile("supabase/functions/send-ride-push/index.ts");

  assertIncludes(dispatch, "const OFFER_SECONDS = 30;", "driver offer timeout");
  assertIncludes(dispatch, 'event: "driver.new_ride_request"', "driver push event");
  assertIncludes(dispatch, 'url: "/motorista/app"', "driver push target");
  assertIncludes(push, '"/motorista/app",', "push route allowlist");
  assertIncludes(push, 'priority: "high"', "Android high-priority delivery");
  assertIncludes(push, 'channel_id: "apois_rides"', "Android APOIS ride channel");
});
