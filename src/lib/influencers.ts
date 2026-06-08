import { supabase } from './supabase';

export interface Influencer {
  id: string;
  slug: string;
  name: string;
  video_url: string | null;
  created_at?: string;
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

// Adiciona um influenciador (nome + vídeo). Retorna { error } se o slug já existir.
export async function addInfluencer(name: string, videoUrl: string): Promise<{ data: Influencer | null; error: string | null }> {
  const slug = slugify(name);
  if (!slug) return { data: null, error: 'Nome inválido.' };

  const { data, error } = await supabase
    .from('lp_influencers')
    .insert([{ slug, name: name.trim(), video_url: videoUrl.trim() || null }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return { data: null, error: `Já existe um influenciador com o link /${slug}.` };
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

// Atualiza nome/vídeo de um influenciador existente
export async function updateInfluencer(id: string, name: string, videoUrl: string): Promise<{ error: string | null }> {
  const slug = slugify(name);
  if (!slug) return { error: 'Nome inválido.' };
  const { error } = await supabase
    .from('lp_influencers')
    .update({ slug, name: name.trim(), video_url: videoUrl.trim() || null })
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
