import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Mailtrap Configuration (consistent with server/server.js)
const MAILTRAP_TOKEN = Deno.env.get("MAILTRAP_TOKEN") || Deno.env.get("MAILTRAP_DEMO_TOKEN") || "";
const EMAIL_FROM = Deno.env.get("MAILTRAP_FROM_EMAIL") || Deno.env.get("EMAIL_FROM") || "sandbox@mailtrap.io";
const APP_URL =
  Deno.env.get("APP_URL") ||
  "https://jbj0005.github.io/BrandonsCalc";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitePayload {
  email: string;
  token: string;
  role?: "viewer" | "manager";
  garage_owner_id?: string;
  invited_by?: string | null;
  appUrl?: string;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    if (!MAILTRAP_TOKEN) {
      throw new Error("MAILTRAP_TOKEN not configured");
    }

    const {
      email,
      token,
      role = "viewer",
      garage_owner_id,
      invited_by,
      appUrl,
    }: InvitePayload = await req.json();

    if (!email || !token) {
      return new Response(
        JSON.stringify({ error: "email and token are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseUrl = (appUrl || APP_URL).replace(/\/+$/, "");
    const inviteLink = `${baseUrl}/?invite=${token}`;

    const subject = "You've been invited to a shared garage";
    const roleLabel = role === "manager" ? "Manager (add/update)" : "Viewer (read-only)";

    const htmlContent = `
<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #111; line-height: 1.6;">
    <h2 style="margin-bottom: 8px;">Garage invite</h2>
    <p>You've been invited to access a shared garage.</p>
    <ul style="padding-left: 16px; color: #333; font-size: 14px;">
      ${garage_owner_id ? `<li>Garage owner: ${garage_owner_id}</li>` : ""}
      <li>Role: ${roleLabel}</li>
    </ul>
    <p style="margin: 16px 0;">
      <a href="${inviteLink}" style="background:#2563eb;color:white;text-decoration:none;padding:10px 14px;border-radius:6px;display:inline-block;">Accept invite</a>
    </p>
    <p style="font-size: 13px; color: #555;">If the button doesn't work, paste this link into your browser:<br>${inviteLink}</p>
  </body>
</html>
    `.trim();

    const textContent = `
You've been invited to access a shared garage.
Role: ${roleLabel}
${garage_owner_id ? `Garage owner: ${garage_owner_id}\n` : ""}Accept: ${inviteLink}
    `.trim();

    // Send email via Mailtrap API (consistent with server/server.js)
    const mailtrapResponse = await fetch(
      "https://send.api.mailtrap.io/api/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MAILTRAP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: {
            email: EMAIL_FROM,
            name: "Brandon's Calculator",
          },
          to: [{ email }],
          subject,
          text: textContent,
          html: htmlContent,
          category: "garage-invite",
        }),
      },
    );

    if (!mailtrapResponse.ok) {
      const errText = await mailtrapResponse.text();
      console.error("Mailtrap error", errText);
      return new Response(
        JSON.stringify({ error: "Mailtrap failed", detail: errText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-garage-invite error", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
