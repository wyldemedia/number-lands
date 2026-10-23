// Adds new sign-ups and workshop "Notify me" requests to MailerLite groups.
// Called by two Supabase database webhooks (INSERT on public.signups and on
// public.workshop_notify). MailerLite automations then send the emails.
//
// Secrets (supabase secrets set ...):
//   MAILERLITE_API_KEY
//   MAILERLITE_SIGNUP_GROUP_ID    group whose automation sends the day 3/7/10 nudges
//   MAILERLITE_NOTIFY_GROUP_ID    group for "tell me when the workshop next runs"
//   WEBHOOK_SECRET                same value as the x-webhook-secret header on both webhooks

const GROUPS: Record<string, string | undefined> = {
  signups: Deno.env.get("MAILERLITE_SIGNUP_GROUP_ID"),
  workshop_notify: Deno.env.get("MAILERLITE_NOTIFY_GROUP_ID"),
};

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const email = body?.record?.email;
  const groupId = GROUPS[body?.table];
  if (body?.type !== "INSERT" || !email || !groupId) {
    return new Response("Ignored", { status: 200 });
  }

  const res = await fetch("https://connect.mailerlite.com/api/subscribers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("MAILERLITE_API_KEY")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email, groups: [groupId], status: "active" }),
  });

  if (!res.ok) {
    // A non-2xx answer makes Supabase log the failed webhook delivery.
    return new Response(`MailerLite ${res.status}: ${await res.text()}`, { status: 502 });
  }
  return new Response("OK", { status: 200 });
});
