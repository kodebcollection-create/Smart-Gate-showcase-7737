import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadVisits } from "./gate-history";

export const askGateInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ question: z.string().trim().min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "guard" || r.role === "admin")) {
      return { error: "Only guards can use this.", answer: null };
    }
    const visits = await loadVisits(context.supabase, 1500);
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { error: "AI is not configured.", answer: null };

    const history = visits
      .map((v) => `${v.student}|${v.regNo}|${v.serial}|in:${v.signIn ?? "-"}|out:${v.signOut ?? "-"}`)
      .join("\n");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions:
          "You are SmartGate's security analyst for a university campus gate (times are UTC; campus is Nairobi, UTC+3). " +
          "Answer the guard's question using only the gate history given. Proactively flag unusual patterns: late-night or very early sign-ins/outs, laptops never signed out, very short or very long stays, many visits in a short time, the same student cycling laptops. " +
          "Be concise, use short bullet points, name students and serials, and say plainly when the data doesn't show something.",
        input: `Gate history (student|reg no|serial|sign-in|sign-out), newest first:\n${history || "(no records)"}\n\nQuestion: ${data.question}`,
      }),
    });
    if (!res.ok || !res.body) {
      const msg = await res.text().catch(() => "");
      const status = res.status;
      return {
        error:
          status === 429 ? "Too many requests, try again shortly." :
          status === 402 ? "AI credits are used up." :
          `AI request failed (${status}). ${msg.slice(0, 200)}`,
        answer: null,
      };
    }
    // Consume the stream server-side and return the final text.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let answer = "";
    let refusal = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") answer += ev.delta;
          if (ev.type === "response.refusal.delta") refusal = true;
          if (ev.type === "error" || ev.type === "response.failed") {
            return { error: ev.error?.message ?? ev.response?.error?.message ?? "AI request failed.", answer: null };
          }
        } catch {
          /* partial */
        }
      }
    }
    if (refusal && !answer) return { error: "The AI declined to answer this question.", answer: null };
    return { error: null, answer: answer || "No answer returned." };
  });
