/// <reference types="vite/client" />
//
// ⚠️ AVISO DE SEGURANÇA — LEIA:
// Este módulo chama a Graph API do Meta DIRETO do navegador. O token vem do painel
// (/admin/configuracoes, tabela `lp_config`) ou, como fallback, de `VITE_META_TOKEN`.
// Nos dois casos ele chega ao navegador e fica PÚBLICO: qualquer visitante do site
// (mesmo sem a senha do /admin) consegue extrair o token e usar a sua conta de
// anúncios. Foi feito assim a pedido (sem backend).
// Pra esconder o token, o caminho é mover esta lógica pra um servidor/Edge Function.
//
// Espelha a lógica do projeto IA-DIRECT-GRANDE (dashboard/lib/metaAds.ts).

import { getMetaCredentials } from './appConfig';

// Versões da Graph API (mesma escolha do projeto de referência: lista numa, insights noutra).
const V_CAMPANHAS = 'v25.0';
const V_INSIGHTS = 'v19.0';

// action_type do Meta. Os apelidos de "lead" vêm com o MESMO valor (não somar — duplica):
// pega o 1º da lista com valor > 0.
const ACTION_CONVERSAS = ['onsite_conversion.messaging_conversation_started_7d'];
const ACTION_LEADS = [
  'lead',
  'onsite_conversion.lead_grouped',
  'onsite_conversion.lead',
  'onsite_web_lead',
];

// Uma linha por campanha.
export interface MetaCampanhaRow {
  campanhaId: string;
  nome: string;          // nome sem a tag (mais limpo); cai pro nome cheio se sobrar vazio
  nomeCompleto: string;
  ativa: boolean;
  status: string;        // rótulo amigável (Ativa / Pausada / …)
  spend: number;         // R$ gasto na janela
  impressions: number;
  reach: number;
  cpm: number;
  linkClicks: number;    // cliques no link (inline_link_clicks)
  ctr: number;           // % (linkClicks / impressions)
  cpc: number;           // R$ por clique no link
  conversas: number;
  leads: number;
  custoPorConversa: number;
  custoPorLead: number;
}

export interface MetaAdsResponse {
  configurado: boolean;  // VITE_META_TOKEN + VITE_META_AD_ACCOUNT estão setados?
  erro: string | null;   // mensagem se a Graph API falhou
  dias: number;          // preset ativo (0 = range custom)
  custom: boolean;
  since: string;
  until: string;
  prefixo: string;       // tag de campanha ativa ('' = todas)
  rows: MetaCampanhaRow[];
}

export interface MetaAdsQuery {
  dias?: number;         // preset (1/7/30/90...)
  since?: string;        // YYYY-MM-DD (range custom — tem prioridade sobre dias)
  until?: string;        // YYYY-MM-DD
  prefixo?: string;      // sobrescreve a tag do env (ex: prefixo do influencer). '' = todas.
}

interface MetaCampaign { id: string; name: string; effective_status?: string; status?: string }
interface MetaAction { action_type: string; value: string }
interface MetaInsightRow {
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  cpm?: string;
  inline_link_clicks?: string;
  actions?: MetaAction[];
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  CAMPAIGN_PAUSED: 'Pausada',
  ADSET_PAUSED: 'Pausada',
  ARCHIVED: 'Arquivada',
  IN_PROCESS: 'Em análise',
  WITH_ISSUES: 'Com problema',
  DISAPPROVED: 'Reprovada',
  PENDING_REVIEW: 'Em revisão',
};
function statusLabel(s: string): string {
  return STATUS_LABEL[s] ?? (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—');
}

function pegaAction(arr: MetaAction[] | undefined, tipos: string[]): number {
  if (!arr) return 0;
  for (const t of tipos) {
    const f = arr.find((a) => a.action_type === t);
    if (f) {
      const v = parseFloat(f.value);
      if (v > 0) return v;
    }
  }
  return 0;
}

// ---- datas no fuso de São Paulo, sem libs ----
function diaBrasilia(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}
function hojeBrasilia(): string { return diaBrasilia(new Date()); }
function somaDias(yyyymmdd: string, n: number): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Normaliza tag/prefixo pra casar COM ou SEM colchetes e ignorando caixa:
// "[ROBLOX] [HANZO]", "ROBLOX HANZO" e "roblox" batem no mesmo alvo.
function normTag(s: string): string {
  return (s || '').replace(/[\[\]]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

// Lista as campanhas (opcionalmente filtradas pela tag — match por "contém", normalizado,
// vale com/sem colchetes: "ROBLOX" pega "[ROBLOX] ..."). Pula arquivadas/excluídas. Pagina.
async function listarCampanhas(adAccount: string, token: string, prefixo: string): Promise<MetaCampaign[]> {
  const out: MetaCampaign[] = [];
  const prefNorm = normTag(prefixo);
  let url: string | undefined =
    `https://graph.facebook.com/${V_CAMPANHAS}/${adAccount}/campaigns?fields=id,name,status,effective_status&limit=200&access_token=${encodeURIComponent(token)}`;
  while (url) {
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json()) as { data?: MetaCampaign[]; paging?: { next?: string }; error?: { message: string } };
    if (json.error) throw new Error(`campanhas: ${json.error.message}`);
    for (const c of json.data ?? []) {
      if (prefNorm && !normTag(c.name).includes(prefNorm)) continue;
      const es = c.effective_status ?? '';
      if (es === 'ARCHIVED' || es === 'DELETED') continue;
      out.push(c);
    }
    url = json.paging?.next;
  }
  return out;
}

const reISO = /^\d{4}-\d{2}-\d{2}$/;

// Puxa os insights por campanha, direto da Graph API. Nunca lança: devolve um objeto
// de erro amigável pra não quebrar a tela.
export async function fetchMetaAds(query: MetaAdsQuery): Promise<MetaAdsResponse> {
  // Credenciais salvas no painel têm prioridade; sem elas, cai no .env.
  const creds = await getMetaCredentials();
  const token = creds.token;
  const adAccount = creds.adAccount;
  // prefixo do query tem prioridade (ex: prefixo do influencer); senão usa o configurado.
  const prefixo = query.prefixo !== undefined ? query.prefixo : creds.prefixo;

  const custom = !!(query.since && query.until && reISO.test(query.since) && reISO.test(query.until));
  let dias: number, since: string, until: string;
  if (custom) {
    [since, until] = query.since! <= query.until! ? [query.since!, query.until!] : [query.until!, query.since!];
    dias = 0;
  } else {
    dias = query.dias && query.dias > 0 ? query.dias : 30;
    until = hojeBrasilia();
    since = somaDias(until, -(Math.max(1, dias) - 1));
  }

  const base = { dias, custom, since, until, prefixo };

  if (!token || !adAccount) {
    return { ...base, configurado: false, erro: null, rows: [] };
  }

  try {
    const campanhas = await listarCampanhas(adAccount, token, prefixo);
    if (campanhas.length === 0) return { ...base, configurado: true, erro: null, rows: [] };
    const ids = campanhas.map((c) => c.id);

    const fields = ['campaign_id', 'campaign_name', 'spend', 'impressions', 'reach', 'cpm', 'inline_link_clicks', 'actions'].join(',');
    const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: ids }]));

    let url: string | undefined =
      `https://graph.facebook.com/${V_INSIGHTS}/${adAccount}/insights` +
      `?fields=${fields}&time_range=${timeRange}&level=campaign` +
      `&limit=500&filtering=${filtering}&access_token=${encodeURIComponent(token)}`;

    // insights só voltam pras campanhas COM gasto na janela -> indexa por id.
    const insightsPorId = new Map<string, MetaInsightRow>();
    while (url) {
      const res = await fetch(url, { cache: 'no-store' });
      const j = (await res.json()) as { data?: MetaInsightRow[]; paging?: { next?: string }; error?: { message: string } };
      if (j.error) throw new Error(`insights: ${j.error.message}`);
      for (const d of j.data ?? []) if (d.campaign_id) insightsPorId.set(d.campaign_id, d);
      url = j.paging?.next;
    }

    const rows: MetaCampanhaRow[] = campanhas.map((c) => {
      const d = insightsPorId.get(c.id);
      const spend = parseFloat(d?.spend ?? '0');
      const conversas = pegaAction(d?.actions, ACTION_CONVERSAS);
      const leads = pegaAction(d?.actions, ACTION_LEADS);
      const impressions = parseInt(d?.impressions ?? '0', 10);
      const linkClicks = parseInt(d?.inline_link_clicks ?? '0', 10);
      const nomeCompleto = c.name;
      // Mostra o nome COMPLETO (com o prefixo/tag) — a pedido.
      const nome = nomeCompleto;
      const es = c.effective_status ?? '';
      return {
        campanhaId: c.id,
        nome,
        nomeCompleto,
        ativa: es === 'ACTIVE',
        status: statusLabel(es),
        spend,
        impressions,
        reach: parseInt(d?.reach ?? '0', 10),
        cpm: parseFloat(d?.cpm ?? '0'),
        linkClicks,
        ctr: impressions > 0 ? (linkClicks / impressions) * 100 : 0,
        cpc: linkClicks > 0 ? spend / linkClicks : 0,
        conversas,
        leads,
        custoPorConversa: conversas > 0 ? spend / conversas : 0,
        custoPorLead: leads > 0 ? spend / leads : 0,
      };
    });

    // ativas primeiro, depois maior gasto.
    rows.sort((a, b) => Number(b.ativa) - Number(a.ativa) || b.spend - a.spend);
    return { ...base, configurado: true, erro: null, rows };
  } catch (e) {
    return { ...base, configurado: true, erro: e instanceof Error ? e.message : String(e), rows: [] };
  }
}

export interface MetaSpendPorDia {
  configurado: boolean;
  erro: string | null;
  porDia: Record<string, number>; // 'YYYY-MM-DD' -> gasto do dia
  total: number;
}

// Gasto do Meta agregado POR DIA (todas as campanhas do prefixo somadas), no período.
// Usa level=account + time_increment=1 (1 linha por dia). Pra cruzar com o funil no
// dashboard (gasto/custos de cada dia no balão do gráfico).
export async function fetchMetaSpendPorDia(
  query: { since: string; until: string; prefixo?: string },
): Promise<MetaSpendPorDia> {
  const creds = await getMetaCredentials();
  const token = creds.token;
  const adAccount = creds.adAccount;
  const prefixo = query.prefixo !== undefined ? query.prefixo : creds.prefixo;

  if (!token || !adAccount) return { configurado: false, erro: null, porDia: {}, total: 0 };

  try {
    const campanhas = await listarCampanhas(adAccount, token, prefixo);
    if (campanhas.length === 0) return { configurado: true, erro: null, porDia: {}, total: 0 };
    const ids = campanhas.map((c) => c.id);

    // garante since <= until (Meta rejeita range invertido)
    const [since, until] = query.since <= query.until ? [query.since, query.until] : [query.until, query.since];
    const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: ids }]));

    let url: string | undefined =
      `https://graph.facebook.com/${V_INSIGHTS}/${adAccount}/insights` +
      `?fields=spend&time_range=${timeRange}&level=account&time_increment=1` +
      `&limit=500&filtering=${filtering}&access_token=${encodeURIComponent(token)}`;

    const porDia: Record<string, number> = {};
    let total = 0;
    while (url) {
      const res = await fetch(url, { cache: 'no-store' });
      const j = (await res.json()) as { data?: MetaInsightRow[]; paging?: { next?: string }; error?: { message: string } };
      if (j.error) throw new Error(`insights: ${j.error.message}`);
      for (const d of j.data ?? []) {
        const dia = d.date_start;
        if (!dia) continue;
        const sp = parseFloat(d.spend ?? '0');
        porDia[dia] = (porDia[dia] ?? 0) + sp;
        total += sp;
      }
      url = j.paging?.next;
    }
    return { configurado: true, erro: null, porDia, total };
  } catch (e) {
    return { configurado: true, erro: e instanceof Error ? e.message : String(e), porDia: {}, total: 0 };
  }
}
