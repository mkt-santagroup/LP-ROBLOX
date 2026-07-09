import { supabase } from './supabase';

export interface Influencer {
  id: string;
  slug: string;
  name: string;
  video_url: string | null;
  roblox_code: string | null; // codiguin do cupom no Roblox (ex: BRASIL, MILA)
  // Segundos de VÍDEO assistido até o botão liberar:
  //   null = não configurado (usa a regra padrão de 75% do vídeo)
  //   0    = liberado desde o início
  //   N>0  = libera após N segundos assistidos
  unlock_seconds: number | null;
  // Link de destino do botão pra este influencer (null/vazio = usa o link padrão da LP)
  redirect_url: string | null;
  // Tag das campanhas de anúncio deste influencer (ex: "[ROBLOX] [HANZO]"). Usado pra
  // atribuir gasto/custo do Meta no dashboard. null/vazio = sem campanha própria.
  ad_prefix: string | null;
  created_at?: string;
}

// Dados editáveis de um influencer (form de novo/edição)
export interface InfluencerInput {
  name: string;
  videoUrl?: string;
  robloxCode?: string;
  unlockSeconds?: number | string | null; // aceita string vinda do input; normalizeUnlockSeconds resolve
  redirectUrl?: string;
  adPrefix?: string;
}

// Padroniza o codiguin (MAIÚSCULO, sem espaços) pra bater com a API do Roblox
export function normalizeCode(code: string): string | null {
  const c = (code || '').trim().toUpperCase().replace(/\s+/g, '');
  return c.length > 0 ? c : null;
}

// Converte o input de segundos do form em número (ou null quando vazio).
// '' -> null (usa a regra padrão de 75%). '0' -> 0 (libera de início).
// Negativos/invalidos viram null pra não travar o cadastro.
export function normalizeUnlockSeconds(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  const n = Math.floor(Number(s));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

// Normaliza uma URL de redirect: vazio -> null.
export function normalizeUrl(value?: string): string | null {
  const v = (value || '').trim();
  return v.length > 0 ? v : null;
}

// Transforma "Nathan Silva" -> "nathan-silva" (sem acento, minúsculo, hífens)
export function slugify(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // remove acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Busca um influenciador pelo slug (usado pela Landing Page pra puxar o vídeo)
export async function getInfluencerBySlug(slug: string): Promise<Influencer | null> {
  if (!slug) return null;
  const { data, error } = await supabase
    .from('lp_influencers')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    console.error('[Influencers] Erro ao buscar por slug:', error);
    return null;
  }
  return data;
}

// Lista todos os influenciadores cadastrados
export async function listInfluencers(): Promise<Influencer[]> {
  const { data, error } = await supabase
    .from('lp_influencers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[Influencers] Erro ao listar:', error);
    return [];
  }
  return data || [];
}

// Monta o payload que vai pro banco a partir do input do form.
function buildPayload(input: InfluencerInput, slug: string) {
  return {
    slug,
    name: input.name.trim(),
    video_url: normalizeUrl(input.videoUrl),
    roblox_code: normalizeCode(input.robloxCode || ''),
    unlock_seconds: normalizeUnlockSeconds(input.unlockSeconds),
    redirect_url: normalizeUrl(input.redirectUrl),
    ad_prefix: (input.adPrefix ?? '').trim() || null,
  };
}

// Adiciona um influenciador. Retorna { error } se o slug já existir.
export async function addInfluencer(input: InfluencerInput): Promise<{ data: Influencer | null; error: string | null }> {
  const slug = slugify(input.name);
  if (!slug) return { data: null, error: 'Nome inválido.' };

  const { data, error } = await supabase
    .from('lp_influencers')
    .insert([buildPayload(input, slug)])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return { data: null, error: `Já existe um influenciador com o link /${slug}.` };
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

// Atualiza um influenciador existente
export async function updateInfluencer(id: string, input: InfluencerInput): Promise<{ error: string | null }> {
  const slug = slugify(input.name);
  if (!slug) return { error: 'Nome inválido.' };
  const { error } = await supabase
    .from('lp_influencers')
    .update(buildPayload(input, slug))
    .eq('id', id);
  if (error) {
    if (error.code === '23505') return { error: `Já existe um influenciador com o link /${slug}.` };
    return { error: error.message };
  }
  return { error: null };
}

// Remove um influenciador
export async function deleteInfluencer(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('lp_influencers').delete().eq('id', id);
  return { error: error ? error.message : null };
}
