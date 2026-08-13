// Zee — the in-dashboard chat assistant's only backend piece. Deliberately
// has NO database access to any HR table: it only ever sees whatever text
// the browser sends as `contextText` (built client-side from the page
// already on screen, see app/js/zee.js's buildPageContext) plus the user's
// question. That is what makes "Zee can't answer about modules you don't
// have access to" true by construction rather than by a permission check
// here that could have a bug — there is simply no code path in this
// function that can go fetch anything else. Do not "fix" that by wiring in
// a service-role client; that would defeat the whole design.
//
// Deployed via the Supabase Dashboard's Edge Functions editor (no Supabase
// CLI on this dev machine — see CLAUDE.md). SUPABASE_URL and
// SUPABASE_ANON_KEY are auto-injected by the Edge Functions runtime;
// ANTHROPIC_API_KEY is a secret you set once via the Dashboard, never
// committed anywhere.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT_TEMPLATE = (pageLabel: string, contextText: string) => `You are Zee, an assistant embedded in the Baladna HR Analytics Dashboard.

The user is currently on the "${pageLabel}" page. Answer ONLY using the DATA CONTEXT below — it is everything currently visible on their screen right now, nothing more.

If the user asks about a different dashboard page/module, or anything the DATA CONTEXT doesn't cover, say you can only help with what's open right now and suggest they navigate to that page instead. Do not guess or use outside knowledge about Baladna. Be concise — a few sentences at most, unless the question genuinely needs a list.

DATA CONTEXT:
${contextText}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return json({ error: "Not signed in." }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData?.user) {
    return json({ error: "Your session has expired — please sign in again." }, 401);
  }

  let body: { pageLabel?: string; contextText?: string; question?: string; history?: Array<{ role: string; content: string }> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  const pageLabel = (body.pageLabel || "this page").slice(0, 200);
  const contextText = (body.contextText || "(nothing on screen yet)").slice(0, 12000);
  const question = (body.question || "").trim().slice(0, 2000);
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

  if (!question) {
    return json({ error: "Ask me something!" }, 400);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: "Zee isn't configured yet — ask your admin to set the ANTHROPIC_API_KEY secret." }, 500);
  }

  const messages = [
    ...history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
    { role: "user", content: question },
  ];

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: SYSTEM_PROMPT_TEMPLATE(pageLabel, contextText),
        messages,
      }),
    });
  } catch {
    return json({ error: "Couldn't reach the AI service — try again in a moment." }, 502);
  }

  if (!anthropicRes.ok) {
    const detail = await anthropicRes.text().catch(() => "");
    console.error("Anthropic API error", anthropicRes.status, detail);
    return json({ error: "Zee had trouble answering that — try again in a moment." }, 502);
  }

  const data = await anthropicRes.json();
  const answer = data?.content?.[0]?.text?.trim() || "I couldn't come up with an answer to that.";
  return json({ answer });
});
