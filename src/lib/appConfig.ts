/// <reference types="vite/client" />
import { supabase } from './supabase';

//
// Configurações globais que precisam ser trocáveis SEM mexer em código.
//
// Ficam numa tabela chave/valor (`lp_config`) pra poderem ser editadas pelo
// painel /admin/configuracoes e valerem na hora, sem rebuild nem deploy.
// O .env continua sendo a rede de segurança: se o banco estiver fora do ar
// (ou a tabela ainda não existir), tudo cai no valor do .env e, em último
// caso, no padrão embutido aqui. A LP NUNCA fica sem um link pra onde ir.
//

/** Link padrão embutido no código — último fallback de todos. */
export const DEFAULT_REDIRECT_URL =
  'https://www.roblox.com/games/start?launchData=utm1%3A0%2C0%2Cweb-link%2Cnavbar-play-button%2C%3B&placeId=124924744052568';

export const DEFAULT_REDIRECT_DELAY_MS = 4000;
export const MIN_REDIRECT_DELAY_MS = 1000;
export const MAX_REDIRECT_DELAY_MS = 15000;

/** Quanto tempo esperamos o banco antes de desistir e seguir com o fallback. */
const CONFIG_TIMEOUT_MS = 2500;

export const CONFIG_KEYS = {
  redirectUrl: 'redirect_url',
  redirectDelay: 'redirect_delay_ms',
  metaToken: 'meta_token',
  metaAdAccount: 'meta_ad_account',
  metaPrefixo: 'meta_prefixo_campanha',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Garante que o valor seja uma URL http(s) utilizável. */
export function isValidUrl(value: string): boolean {
  const v = (value || '').trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Mantém o tempo de espera numa faixa sã (1s a 15s). */
export function clampDelay(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_REDIRECT_DELAY_MS;
  return Math.min(Math.max(n, MIN_REDIRECT_DELAY_MS), MAX_REDIRECT_DELAY_MS);
}

/** A conta de anúncios do Meta precisa do prefixo `act_`. Aceita colado sem ele. */
export function normalizeAdAccount(value: string): string {
  const v = (value || '').trim();
  if (!v) return '';
  return /^act_/i.test(v) ? v : `act_${v.replace(/^act/i, '').replace(/^_/, '')}`;
}

/** Rejeita a promise se ela demorar demais — a LP não pode ficar presa esperando o banco. */
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Lê todas as chaves de `lp_config` de uma vez. Nunca lança. */
async function readConfigRows(): Promise<{ map: Map<string, string>; error: string | null }> {
  try {
    const { data, error } = await withTimeout(
      supabase.from('lp_config').select('key, value'),
      CONFIG_TIMEOUT_MS,
    );
    if (error) {
      const msg = (error as any).code === '42P01'
        ? 'A tabela lp_config ainda não existe no banco — rode a migration.'
        : error.message;
      return { map: new Map(), error: msg };
    }
    return {
      map: new Map((data ?? []).map((r: any) => [r.key, (r.value ?? '').trim()])),
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error && e.message === 'timeout'
      ? 'O banco demorou demais pra responder — usando os valores do .env.'
      : 'Não foi possível ler as configurações do banco — usando os valores do .env.';
    return { map: new Map(), error: msg };
  }
}

/** Grava/atualiza chaves em `lp_config`. */
async function writeConfigRows(rows: { key: string; value: string }[]): Promise<{ error: string | null }> {
  const { error } = await supabase.from('lp_config').upsert(rows, { onConflict: 'key' });
  if (!error) return { error: null };
  if ((error as any).code === '42P01') {
    return { error: 'A tabela lp_config ainda não existe. Rode a migration supabase/migrations/20260731_create_lp_config.sql no SQL Editor do Supabase.' };
  }
  return { error: error.message };
}

// ---------------------------------------------------------------------------
// Redirecionamento da LP
// ---------------------------------------------------------------------------

export interface AppConfig {
  redirectUrl: string;
  redirectDelayMs: number;
  /** De onde veio o link em uso — mostrado no painel pra não haver dúvida. */
  source: 'banco' | 'env' | 'padrão';
}

export interface ConfigLoadResult extends AppConfig {
  /** Erro ao ler do banco (tabela faltando, projeto fora do ar...). null = ok. */
  error: string | null;
}

const envRedirectUrl = (import.meta.env.VITE_REDIRECT_URL ?? '').trim();
const envRedirectDelay = (import.meta.env.VITE_REDIRECT_DELAY_MS ?? '').toString().trim();

/** Configuração usada quando o banco não responde: .env, senão o padrão do código. */
export function fallbackConfig(): AppConfig {
  const hasEnvUrl = isValidUrl(envRedirectUrl);
  return {
    redirectUrl: hasEnvUrl ? envRedirectUrl : DEFAULT_REDIRECT_URL,
    redirectDelayMs: envRedirectDelay ? clampDelay(envRedirectDelay) : DEFAULT_REDIRECT_DELAY_MS,
    source: hasEnvUrl ? 'env' : 'padrão',
  };
}

/**
 * Lê a config de redirect do banco. Nunca lança: em qualquer falha devolve o
 * fallback do .env com o erro descrito em `error`.
 */
export async function fetchAppConfig(): Promise<ConfigLoadResult> {
  const fallback = fallbackConfig();
  const { map, error } = await readConfigRows();
  if (error) return { ...fallback, error };

  const dbUrl = map.get(CONFIG_KEYS.redirectUrl) ?? '';
  const dbDelay = map.get(CONFIG_KEYS.redirectDelay) ?? '';
  const hasDbUrl = isValidUrl(dbUrl);

  return {
    redirectUrl: hasDbUrl ? dbUrl : fallback.redirectUrl,
    redirectDelayMs: dbDelay ? clampDelay(dbDelay) : fallback.redirectDelayMs,
    source: hasDbUrl ? 'banco' : fallback.source,
    error: null,
  };
}

/** Grava a config de redirect. Usado pelo painel /admin/configuracoes. */
export async function saveAppConfig(cfg: { redirectUrl: string; redirectDelayMs: number }): Promise<{ error: string | null }> {
  const url = (cfg.redirectUrl || '').trim();
  if (!isValidUrl(url)) return { error: 'O link precisa ser uma URL válida começando com http:// ou https://' };

  return writeConfigRows([
    { key: CONFIG_KEYS.redirectUrl, value: url },
    { key: CONFIG_KEYS.redirectDelay, value: String(clampDelay(cfg.redirectDelayMs)) },
  ]);
}

// ---------------------------------------------------------------------------
// Credenciais do Meta (Facebook) Ads
// ---------------------------------------------------------------------------

export interface MetaCredentials {
  token: string;
  adAccount: string;
  prefixo: string;
  /** Se está configurado e de onde veio. */
  configurado: boolean;
  source: 'banco' | 'env' | 'nenhum';
  error: string | null;
}

const envMetaToken = (import.meta.env.VITE_META_TOKEN ?? '').trim();
const envMetaAdAccount = (import.meta.env.VITE_META_AD_ACCOUNT ?? '').trim();
const envMetaPrefixo = (import.meta.env.VITE_META_PREFIXO_CAMPANHA ?? '').trim();

/** Cache da leitura pra não bater no banco a cada chamada da Graph API. */
let metaCredsCache: Promise<MetaCredentials> | null = null;

/** Força a próxima leitura a ir no banco de novo (chamado depois de salvar). */
export function invalidateMetaCredentials(): void {
  metaCredsCache = null;
}

async function loadMetaCredentials(): Promise<MetaCredentials> {
  const { map, error } = await readConfigRows();

  const dbToken = map.get(CONFIG_KEYS.metaToken) ?? '';
  const dbAccount = map.get(CONFIG_KEYS.metaAdAccount) ?? '';
  const dbPrefixo = map.get(CONFIG_KEYS.metaPrefixo) ?? '';

  // O que está salvo no painel tem prioridade sobre o .env — assim dá pra trocar
  // o token sem deploy. Se o painel estiver vazio, cai no .env.
  const fromDb = !!(dbToken && dbAccount);
  const token = dbToken || envMetaToken;
  const adAccount = normalizeAdAccount(dbAccount || envMetaAdAccount);
  // O prefixo vazio é uma escolha válida ("todas as campanhas"), então só cai no
  // .env quando o par token+conta também veio de lá.
  const prefixo = fromDb ? dbPrefixo : envMetaPrefixo;

  const configurado = !!(token && adAccount);
  return {
    token,
    adAccount,
    prefixo,
    configurado,
    source: configurado ? (fromDb ? 'banco' : 'env') : 'nenhum',
    error,
  };
}

/** Credenciais do Meta em uso (painel > .env). Resultado é cacheado. */
export function getMetaCredentials(): Promise<MetaCredentials> {
  if (!metaCredsCache) metaCredsCache = loadMetaCredentials();
  return metaCredsCache;
}

/** Grava as credenciais do Meta pelo painel. Campo vazio = apaga (volta pro .env). */
export async function saveMetaCredentials(creds: { token: string; adAccount: string; prefixo: string }): Promise<{ error: string | null }> {
  const token = (creds.token || '').trim();
  const adAccount = normalizeAdAccount(creds.adAccount);

  if ((token && !adAccount) || (!token && adAccount)) {
    return { error: 'Preencha o token E a conta de anúncios — os dois juntos, ou os dois vazios pra voltar a usar o .env.' };
  }
  if (adAccount && !/^act_\d+$/.test(adAccount)) {
    return { error: 'A conta de anúncios deve ser act_ seguido só de números (ex: act_1234567890).' };
  }

  const res = await writeConfigRows([
    { key: CONFIG_KEYS.metaToken, value: token },
    { key: CONFIG_KEYS.metaAdAccount, value: adAccount },
    { key: CONFIG_KEYS.metaPrefixo, value: (creds.prefixo || '').trim() },
  ]);
  if (!res.error) invalidateMetaCredentials();
  return res;
}
