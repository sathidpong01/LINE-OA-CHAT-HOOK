import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET")!;
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN"); // Made optional in case it's missing

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function verifySignature(signature: string, body: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const hash = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return signature === expectedSignature;
}

async function fetchDisplayName(userId: string): Promise<string | null> {
  if (!LINE_CHANNEL_ACCESS_TOKEN) return null;
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      return data.displayName || null;
    } else {
      console.error("Failed to fetch profile. Status:", res.status);
    }
  } catch (err) {
    console.error("Error fetching display name:", err);
  }
  return null;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const signature = req.headers.get("x-line-signature");
    if (!signature) {
      return new Response("Missing signature", { status: 401 });
    }

    const bodyText = await req.text();
    
    // Verify signature
    const isValid = await verifySignature(signature, bodyText, LINE_CHANNEL_SECRET);
    if (!isValid) {
      console.error("Invalid signature");
      return new Response("Invalid signature", { status: 401 });
    }

    const body = JSON.parse(bodyText);
    const events = body.events || [];

    for (const event of events) {
      if (event.type === "message") {
        const lineUserId = event.source?.userId;
        const eventTime = new Date(event.timestamp).toISOString();
        const messageId = event.message?.id;
        const messageType = event.message?.type;
        const text = messageType === "text" ? event.message?.text : null;
        
        // Fetch display name if we have a user ID
        let displayName = null;
        if (lineUserId) {
          displayName = await fetchDisplayName(lineUserId);
        }
        
        // Insert into Supabase
        const { error } = await supabase.from("line_messages").insert({
          event_time: eventTime,
          line_user_id: lineUserId,
          display_name: displayName,
          message_id: messageId,
          message_type: messageType,
          text: text,
          raw_event: event
        });

        if (error) {
          console.error("Supabase insert error:", error);
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Error processing webhook:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
