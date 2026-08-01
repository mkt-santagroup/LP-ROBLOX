/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// Placeholders do .env que NÃO são credenciais de verdade — se algum deles
// chegar aqui, o .env foi criado mas não preenchido.
const PLACEHOLDERS = [
  'COLE_AQUI_A_PROJECT_URL',
  'COLE_AQUI_A_ANON_PUBLIC_KEY',
  'your_supabase_url',
  'your_supabase_anon_key',
];

// `.trim()` porque espaço/quebra de linha sobrando no .env é a causa mais comum
// de "a chave está certa mas não conecta" — o valor vai pra URL do fetch e quebra.
const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

// Tira barra no final: `https://x.supabase.co/` viraria `//rest/v1` na requisição.
const supabaseUrl = rawUrl.replace(/\/+$/, '');
const supabaseAnonKey = rawKey;

// Referência do projeto (o "xxxx" de https://xxxx.supabase.co) — usada no diagnóstico.
export const projectRef = (() => {
  const m = supabaseUrl.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i);
  return m ? m[1] : null;
})();

function describeConfig(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];

  if (!supabaseUrl) {
    problems.push('VITE_SUPABASE_URL está vazia ou não existe no .env.');
  } else if (PLACEHOLDERS.includes(supabaseUrl)) {
    problems.push('VITE_SUPABASE_URL ainda está com o texto de exemplo — cole a Project URL real.');
  } else if (!/^https:\/\//i.test(supabaseUrl)) {
    problems.push('VITE_SUPABASE_URL precisa começar com https:// (cole a URL completa).');
  } else if (!projectRef) {
    problems.push(`VITE_SUPABASE_URL não parece uma URL de projeto Supabase: "${supabaseUrl}".`);
  }

  if (!supabaseAnonKey) {
    problems.push('VITE_SUPABASE_ANON_KEY está vazia ou não existe no .env.');
  } else if (PLACEHOLDERS.includes(supabaseAnonKey)) {
    problems.push('VITE_SUPABASE_ANON_KEY ainda está com o texto de exemplo — cole a chave anon real.');
  }

  return { ok: problems.length === 0, problems };
}

export const supabaseConfig = {
  url: supabaseUrl,
  projectRef,
  ...describeConfig(),
};

if (!supabaseConfig.ok) {
  console.error(
    '%c[Supabase] Configuração incompleta:\n' + supabaseConfig.problems.map(p => '  • ' + p).join('\n') +
    '\n\nEdite o arquivo .env na raiz do projeto e reinicie o `npm run dev`.',
    'color:#ef4444;font-weight:bold',
  );
}

// O supabase-js LANÇA no `createClient` se a URL não for http(s) válida — e como
// isso roda no import do módulo, um .env vazio ou com o texto de exemplo derrubaria
// o app inteiro em tela branca, inclusive a LP de redirecionamento.
// Por isso só a URL já validada vai pro cliente; sem ela, usa um domínio de
// fachada e deixa a tela de diagnóstico do /admin explicar o que falta.
const clientUrl = supabaseConfig.ok ? supabaseUrl : 'https://placeholder.supabase.co';
const clientKey = supabaseAnonKey || 'placeholder-anon-key';

export const supabase = createClient(clientUrl, clientKey);

/**
 * UPDATE em `lp_roblox` que SOBREVIVE à navegação pra fora do site.
 *
 * O supabase-js usa um fetch comum, e o navegador CANCELA qualquer fetch
 * pendente assim que a página começa a sair (`window.location.replace`). Na LP
 * de redirecionamento isso fazia perder justamente o registro mais importante —
 * o de quem foi mandado pro jogo — em toda conexão mais lenta que o teto de
 * espera. Com `keepalive: true` o navegador se compromete a terminar a
 * requisição mesmo depois de a página morrer, então a gravação não depende mais
 * de segurar a pessoa na tela.
 *
 * Fala direto com o PostgREST porque o `keepalive` não é exposto pelo
 * supabase-js. Nunca lança: tracking não pode impedir ninguém de chegar no jogo.
 */
export async function updateVisitorKeepalive(
  visitorId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!supabaseConfig.ok || !visitorId) return false;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/lp_roblox?visitor_id=eq.${encodeURIComponent(visitorId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: clientKey,
          Authorization: `Bearer ${clientKey}`,
          'Content-Type': 'application/json',
          // Sem corpo de resposta: menos bytes trafegando bem na hora em que a
          // página está sendo destruída.
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(payload),
        keepalive: true,
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export type SupabaseHealth = {
  ok: boolean;
  /** Categoria do problema — usada pra escolher a instrução mostrada no admin. */
  kind: 'ok' | 'config' | 'dns' | 'network' | 'auth' | 'table' | 'unknown';
  title: string;
  detail: string;
  /** O que fazer pra resolver. */
  hint: string;
};

/**
 * Testa a conexão de verdade e traduz o erro pra linguagem humana.
 *
 * O caso mais comum e mais confuso é o `ERR_NAME_NOT_RESOLVED`: o navegador nem
 * chega a falar com o Supabase porque o domínio do projeto não existe mais no DNS
 * (projeto pausado pelo plano free, projeto deletado, ou URL trocada). Como o
 * fetch falha ANTES de qualquer resposta HTTP, o supabase-js só devolve um
 * "Failed to fetch" genérico — daí a tela ficar em branco sem explicação.
 */
export async function checkSupabaseHealth(): Promise<SupabaseHealth> {
  if (!supabaseConfig.ok) {
    return {
      ok: false,
      kind: 'config',
      title: 'Credenciais do Supabase não configuradas',
      detail: supabaseConfig.problems.join(' '),
      hint: 'Abra o arquivo .env na raiz do projeto, preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e reinicie o servidor (npm run dev).',
    };
  }

  const unreachable = (extra: string): SupabaseHealth => ({
    ok: false,
    kind: 'dns',
    title: 'Não foi possível alcançar o projeto do Supabase',
    detail: `O navegador não conseguiu falar com "${projectRef}.supabase.co"${extra}. A requisição falha ANTES de a chave ser checada — ou seja, não é problema de chave.`,
    hint: 'Abra supabase.com/dashboard e confira este projeto: (1) se estiver PAUSADO, clique em "Restore project" — o plano free pausa sozinho após ~7 dias sem uso e o domínio some do DNS; (2) se o projeto foi apagado ou recriado, a Project URL mudou — copie a nova em Project Settings → Data API e atualize o .env; (3) confirme que você não está sem internet ou atrás de um DNS/VPN que bloqueia o domínio.',
  });

  try {
    // Consulta uma tabela REAL que o painel usa, em vez do endpoint raiz do
    // PostgREST (`/rest/v1/`) — aquele responde 401 em vários projetos mesmo
    // com a chave correta, o que gerava um diagnóstico falso de "chave recusada".
    // `head: true` não traz linhas: só queremos saber se a chamada passa.
    const { error } = await supabase
      .from('lp_roblox')
      .select('visitor_id', { head: true, count: 'exact' })
      .limit(1);

    if (!error) {
      return { ok: true, kind: 'ok', title: 'Conectado', detail: `Projeto "${projectRef}" respondendo normalmente.`, hint: '' };
    }

    const msg = (error.message || '').toLowerCase();

    // Erro de rede não vira exceção no supabase-js — chega como mensagem aqui.
    if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('fetch failed')) {
      return unreachable('');
    }

    // Tabela ausente: a conexão e a chave estão OK, falta rodar as migrations.
    if (error.code === '42P01' || msg.includes('does not exist')) {
      return {
        ok: false,
        kind: 'table',
        title: 'Conectado, mas a tabela lp_roblox não existe',
        detail: `A chave funciona e o projeto "${projectRef}" respondeu — o que falta é a estrutura do banco.`,
        hint: 'Rode os arquivos de supabase/migrations/ no SQL Editor do Supabase (em ordem). Eles são idempotentes, pode rodar sem medo.',
      };
    }

    // Chave inválida de verdade: o PostgREST diz explicitamente.
    if (msg.includes('invalid api key') || msg.includes('jwt') || error.code === 'PGRST301' || error.code === '401') {
      return {
        ok: false,
        kind: 'auth',
        title: 'Chave anon recusada pelo Supabase',
        detail: `O projeto "${projectRef}" rejeitou a chave: ${error.message}`,
        hint: 'Copie de novo a chave "anon public" em Project Settings → Data API, cole em VITE_SUPABASE_ANON_KEY e reinicie o servidor (npm run dev).',
      };
    }

    return {
      ok: false,
      kind: 'unknown',
      title: 'O Supabase respondeu com erro',
      detail: `${error.message}${error.code ? ` (código ${error.code})` : ''}`,
      hint: 'Confira no painel do Supabase se o projeto está ativo e se as tabelas e políticas de RLS existem.',
    };
  } catch (e) {
    // fetch rejeitado = a requisição nem saiu (DNS, offline, CORS de origem inválida).
    return unreachable(e instanceof Error ? ` (${e.message})` : '');
  }
}

export const getMockData = async () => {
  return {
    // VÍDEO PUXANDO DIRETO DA URL EXTERNA
    videoUrl: 'https://pub-728fe5c9fe7c4bb596858eeaceb12b1a.r2.dev/LP%20VIDEO%20V3.mp4',
    gameUrl: 'https://www.roblox.com/games/start?launchData=utm1%3A0%2C0%2Cweb-link%2Cnavbar-play-button%2C%3B&placeId=124924744052568',
    // Defaults da LP principal (sobrescritos pelo influencer quando houver):
    //   unlockSeconds null = regra padrão de 75% do vídeo; redirectUrl null = usa gameUrl
    unlockSeconds: null as number | null,
    redirectUrl: null as string | null,
    logoUrl: 'data:image/webp;base64,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'
  };
};