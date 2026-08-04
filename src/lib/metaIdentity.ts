/// <reference types="vite/client" />
//
// Identificadores de anúncio do Meta.
//
// A LP virou um redirect de poucos segundos: a pessoa não faz NADA aqui dentro.
// Não tem vídeo pra assistir nem botão pra clicar, então não existe nenhum
// comportamento na página que sirva pra dizer ao Meta "esse clique é bom".
// O que sobra — e é o que este módulo cuida — é carregar junto com a conversão
// a identidade de QUEM clicou no anúncio, pra que o Meta consiga ligar o evento
// de volta ao anúncio, ao público e à pessoa.
//
// São três dados, e eles se completam:
//
//   fbclid -> vem na URL do anúncio (?fbclid=...). É o clique em si, e é o
//             sinal mais forte de todos: identifica o anúncio exato.
//   _fbc   -> o fbclid no formato que o Meta consome, com o instante do clique.
//   _fbp   -> identifica o NAVEGADOR. Cobre quem volta depois sem fbclid na URL.
//
// Aqui a gente só LÊ os cookies `_fbc`/`_fbp` — nunca escreve neles. Quem os
// cria é o próprio pixel. Se a gente também escrevesse, o cookie sairia num
// escopo de domínio possivelmente diferente do que o pixel usa, e aí
// `document.cookie` passaria a devolver DOIS cookies com o mesmo nome, sem
// jeito confiável de saber qual é o válido. O único valor que este módulo cria
// por conta própria (o `fbc` derivado do fbclid, pra quando o pixel ainda não
// rodou) mora no localStorage, onde não colide com nada.
//
// Nada aqui lança: se o navegador estiver em modo privado, com storage cheio ou
// com cookies bloqueados, a captura simplesmente devolve null e o redirect
// segue normal. Tracking nunca pode impedir alguém de chegar no jogo.
//

/** Mesma chave que o tracking sempre usou — o visitante não pode "renascer". */
const VISITOR_KEY = 'roblox_analytics_visitor_id';

/** Onde guardamos o que derivamos por conta própria (nunca em cookie). */
const FBCLID_KEY = 'meta_fbclid';
const FBC_KEY = 'meta_fbc';
const CAMPAIGN_KEY = 'meta_campaign_params';

/**
 * Parâmetros de campanha que valem a pena guardar. Os `utm_*` são os padrão;
 * os três últimos são os que o Meta preenche sozinho quando o gestor usa as
 * macros {{campaign.id}} / {{adset.id}} / {{ad.id}} na URL do anúncio — é o
 * que permite, depois, dizer qual ANÚNCIO específico trouxe quem converteu.
 */
const CAMPAIGN_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'campaign_id',
  'adset_id',
  'ad_id',
] as const;

export interface MetaIdentity {
  /** ID estável do navegador — vira o `external_id` do Meta. */
  externalId: string;
  /** O clique no anúncio, cru, como veio na URL. */
  fbclid: string | null;
  /** Cookie `_fbc` do pixel; na falta dele, o valor derivado do fbclid. */
  fbc: string | null;
  /** Cookie `_fbp` do pixel. Só existe depois que o pixel rodou. */
  fbp: string | null;
}

// ---------------------------------------------------------------------------
// Acesso a storage e cookie — sempre tolerante a falha
// ---------------------------------------------------------------------------

function safeGet(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    return v && v.length > 0 ? v : null;
  } catch {
    // Modo privado / storage desabilitado.
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage cheio ou bloqueado: seguimos sem persistir.
  }
}

function readCookie(name: string): string | null {
  try {
    const target = `${name}=`;
    for (const part of document.cookie.split(';')) {
      const c = part.trim();
      if (c.startsWith(target)) {
        const v = c.slice(target.length).trim();
        return v.length > 0 ? v : null;
      }
    }
  } catch {
    // document.cookie pode lançar em contexto sem cookies (iframe sandbox).
  }
  return null;
}

// ---------------------------------------------------------------------------
// Visitante
// ---------------------------------------------------------------------------

// Memoizado porque, se o localStorage estiver bloqueado, cada leitura geraria
// um UUID novo — e o mesmo acesso apareceria como várias pessoas diferentes.
let visitorIdCache: string | null = null;

/**
 * ID estável do navegador. É o `visitor_id` do banco e, no Meta, o
 * `external_id` — o parâmetro de Advanced Matching que não depende de a pessoa
 * ter preenchido e-mail ou telefone (que esta LP não coleta).
 */
export function getVisitorId(): string {
  if (visitorIdCache) return visitorIdCache;

  const stored = safeGet(VISITOR_KEY);
  visitorIdCache = stored ?? crypto.randomUUID();
  if (!stored) safeSet(VISITOR_KEY, visitorIdCache);

  return visitorIdCache;
}

// ---------------------------------------------------------------------------
// Captura
// ---------------------------------------------------------------------------

/**
 * Monta o `fbc` no formato que o Meta espera: `fb.1.<criado_em_ms>.<fbclid>`.
 * O `1` é o índice de subdomínio — é o valor que o próprio pixel usa quando o
 * cookie vive no domínio principal, que é o caso aqui.
 */
function buildFbc(fbclid: string): string {
  return `fb.1.${Date.now()}.${fbclid}`;
}

/**
 * Lê os parâmetros de anúncio da URL e guarda.
 *
 * Precisa rodar LOGO na montagem da página: esses dados só existem na URL do
 * primeiro acesso, e esta LP navega pra fora em poucos segundos. O que não for
 * capturado aqui está perdido pra sempre — não dá pra recuperar depois.
 */
export function captureAdParams(search: string = window.location.search): void {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return;
  }

  const fbclid = (params.get('fbclid') ?? '').trim();
  if (fbclid) {
    // LAST-touch de propósito, ao contrário do influencer (que é first-touch):
    // se a pessoa voltou clicando num anúncio NOVO, é esse clique novo que o
    // Meta quer atribuir. O cookie `_fbc` do próprio pixel funciona assim.
    safeSet(FBCLID_KEY, fbclid);
    safeSet(FBC_KEY, buildFbc(fbclid));
  }

  const campaign: Record<string, string> = {};
  for (const key of CAMPAIGN_PARAMS) {
    const value = (params.get(key) ?? '').trim();
    if (value) campaign[key] = value;
  }
  // Só sobrescreve quando veio alguma coisa: um acesso direto (sem parâmetro
  // nenhum) não pode apagar a campanha que trouxe a pessoa da primeira vez.
  if (Object.keys(campaign).length > 0) {
    safeSet(CAMPAIGN_KEY, JSON.stringify(campaign));
  }
}

/**
 * Janela do `fbc`: 90 dias, a MESMA que o pixel usa no cookie `_fbc`
 * (o `fbevents.js` guarda 2160 horas). Clique mais velho que isso está fora da
 * janela de atribuição do Meta — restaurar não ajudaria e ainda mandaria um
 * dado velho como se fosse recente.
 */
const FBC_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Devolve o `fbclid` do último clique em anúncio pra URL, quando esta visita
 * não trouxe um.
 *
 * Por que isso existe: o `fbc` é o parâmetro que MAIS pesa na qualidade da
 * correspondência de eventos (+32% no diagnóstico do Events Manager), e quem
 * cria esse valor é o pixel — mas só se achar `?fbclid=` na URL ou o cookie
 * `_fbc` já pronto. Quem clicou no anúncio ontem e hoje voltou pelo link do
 * influencer chega sem nenhum dos dois, e a conversão sai sem `fbc`.
 *
 * A gente devolve o `fbclid` pra query string e deixa o PIXEL fazer o resto.
 * É de propósito que não escrevemos o cookie `_fbc` na mão: o pixel escolhe o
 * domínio do cookie subindo pelos níveis do host até achar o mais amplo que
 * cola, e um cookie nosso num escopo diferente viraria DOIS `_fbc` com o mesmo
 * nome — sem jeito confiável de saber qual vale. Mexendo só na URL, quem grava
 * continua sendo o pixel, no escopo dele e no formato dele.
 *
 * Precisa rodar ANTES do `fbq('init')`. Devolve se restaurou algo.
 */
export function restoreFbclidToUrl(): boolean {
  try {
    // Veio fbclid nesta visita: o pixel resolve sozinho, não temos o que fazer.
    const url = new URL(window.location.href);
    if ((url.searchParams.get('fbclid') ?? '').trim()) return false;

    // O cookie do pixel já existe (visita recente): idem.
    if (readCookie('_fbc')) return false;

    // `fb.1.<criado_em_ms>.<fbclid>` — o que guardamos no primeiro clique.
    const saved = safeGet(FBC_KEY);
    if (!saved) return false;

    const parts = saved.split('.');
    if (parts.length < 4) return false;

    const createdAt = Number(parts[2]);
    if (!Number.isFinite(createdAt)) return false;
    if (Date.now() - createdAt > FBC_MAX_AGE_MS) return false;

    const fbclid = parts.slice(3).join('.');
    if (!fbclid) return false;

    url.searchParams.set('fbclid', fbclid);
    // `replaceState` e não `pushState`: isto não é navegação, é só deixar o
    // parâmetro visível pro pixel. Nada no app lê a query string, e a LP sai
    // da página em segundos.
    window.history.replaceState(window.history.state, '', url.toString());
    return true;
  } catch {
    // URL estranha, history bloqueado: segue sem restaurar.
    return false;
  }
}

/**
 * Identidade do Meta pra este visitante, no melhor estado disponível AGORA.
 *
 * De propósito não é cacheada: o `_fbp` nasce quando o pixel roda, o que pode
 * acontecer DEPOIS da montagem da página. Chamar de novo na hora da conversão
 * (quando já se passaram os segundos da tela de espera) costuma devolver um
 * `fbp` que não existia no começo.
 */
export function getMetaIdentity(): MetaIdentity {
  return {
    externalId: getVisitorId(),
    fbclid: safeGet(FBCLID_KEY),
    // O cookie do pixel ganha do nosso derivado: se o pixel já rodou, é o valor
    // DELE que vai no evento do navegador, e os dois lados precisam bater pro
    // Meta tratar como a mesma pessoa.
    fbc: readCookie('_fbc') ?? safeGet(FBC_KEY),
    fbp: readCookie('_fbp'),
  };
}

/** Parâmetros de campanha guardados (utm_*, ids de anúncio). */
export function getCampaignParams(): Record<string, string> | null {
  const raw = safeGet(CAMPAIGN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
