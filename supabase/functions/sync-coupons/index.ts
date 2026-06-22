// Supabase Edge Function: sync-coupons
// Espelha os usos de cupom da API do Roblox para a tabela `coupon_usages`.
// Roda periodicamente (via Supabase Cron) — faz UPSERT por id, sem duplicar.
//
// Variáveis de ambiente (secrets) necessárias:
//   ROBLOX_API_TOKEN  -> o token admin da API de cupons
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY -> injetados automaticamente pelo Supabase
//
// Deploy:  supabase functions deploy sync-coupons
// Secret:  supabase secrets set ROBLOX_API_TOKEN=8e5aa0d0...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ROBLOX_API = "https://apiroblox.roleplayrp.com/stats/usages?limit=500";

Deno.serve(async () => {
  const ROBLOX_TOKEN = Deno.env.get("ROBLOX_API_TOKEN");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!ROBLOX_TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "Variáveis de ambiente faltando" }, 500);
  }

  // 1) Busca os usos mais recentes na API do Roblox
  const res = await fetch(ROBLOX_API, {
    headers: { Authorization: `Bearer ${ROBLOX_TOKEN}` },
  });
  if (!res.ok) {
    return json({ error: `API Roblox respondeu ${res.status}` }, 502);
  }
  const usages = await res.json();
  if (!Array.isArray(usages)) {
    return json({ error: "Formato inesperado da API" }, 502);
  }

  // 2) Converte pro formato da tabela
  const rows = usages.map((u: any) => ({
    id: u.id,
    user_id: String(u.userId ?? ""),
    name: u.name ?? null,
    coupon_code: (u.couponCode ?? "").toUpperCase(),
    robux_spent: u.robuxSpent ?? 0,
    play_time: u.playTime ?? 0,
    used_at: u.usedAt,
  }));

  // 3) UPSERT por id — registros já existentes não duplicam
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error } = await supabase
    .from("coupon_usages")
    .upsert(rows, { onConflict: "id" });

  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, synced: rows.length, at: new Date().toISOString() });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
