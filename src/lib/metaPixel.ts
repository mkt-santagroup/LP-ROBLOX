/// <reference types="vite/client" />
//
// Pixel do Meta — DOIS eventos, e só esses dois:
//
//   1. PageView       -> quando a pessoa abre a LP
//   2. Reencaminhado  -> quando ela é mandada pro jogo (A CONVERSÃO)
//
// O pixel mora AQUI, no código, e não mais dentro do GTM. O motivo é simples:
// enquanto ele dependeu de tag configurada no container, qualquer mudança na
// página (o vídeo sair, o botão sumir) derrubava o disparo em silêncio — do lado
// de cá tudo parecia certo e o Events Manager não recebia nada. Com o pixel no
// código, o que dispara está escrito no repositório e dá pra ler, testar e
// versionar junto com a LP.
//
// ⚠️ Se ainda existir uma tag do pixel do Meta dentro do GTM-TL5N76RP, ela
//    precisa ser PAUSADA — senão o mesmo evento é contado duas vezes.
//
// ---------------------------------------------------------------------------
// O QUE VAI JUNTO DOS EVENTOS (qualidade da correspondência)
// ---------------------------------------------------------------------------
//
// O `fbevents.js` aceita como Advanced Matching exatamente estas chaves:
//
//   em, ph, fn, ln, ge, db, ct, st, zp, country, external_id, subscription_id
//
// Desta lista, a LP só tem como preencher DUAS com honestidade:
//
//   external_id -> o `visitor_id` do navegador;
//   country     -> deduzido do fuso horário do próprio navegador (o Meta pede
//                  explicitamente pra mandar sempre o país, mesmo quando é
//                  sempre o mesmo, porque a correspondência é global).
//
// As outras (e-mail, telefone, nome, sobrenome, nascimento, gênero, cidade,
// estado, CEP) exigem dados que esta LP NÃO coleta — ela é uma tela de
// redirecionamento de ~4s, não pede nada a ninguém. Preencher com palpite
// pioraria a correspondência em vez de melhorar: hash errado não casa com
// ninguém. Se um dia a LP passar a pedir algum desses dados, é só acrescentar
// em `buildAdvancedMatching` e ele já entra nos dois eventos.
//
// `fbc` (identificação de clique) e `fbp` (identificação do navegador) NÃO são
// parâmetros que a gente passa: o pixel lê os cookies `_fbc`/`_fbp` sozinho.
// O `fbc` nasce do `?fbclid=` na URL — é por isso que `restoreFbclidToUrl()`
// roda antes do `init`, pra devolver esse parâmetro pra URL de quem já clicou
// num anúncio antes e voltou por outro caminho.
//
// IP e user agent o Meta preenche sozinho no lado dele, por serem parte de como
// a requisição chega. Não há nada a fazer no código por eles.
//

import { restoreFbclidToUrl } from './metaIdentity';

const ENV_PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID ?? '').toString().trim();

/**
 * Pixel usado pelo projeto antes de tudo virar GTM (jun/2026). Fica como padrão
 * pra LP nunca ficar sem pixel por falta de .env; o `VITE_META_PIXEL_ID` manda
 * quando estiver preenchido.
 */
const DEFAULT_PIXEL_ID = '1594793878256072';

/** ID em uso. Só aceita dígitos — um valor colado errado cairia no padrão. */
export const META_PIXEL_ID = /^\d+$/.test(ENV_PIXEL_ID) ? ENV_PIXEL_ID : DEFAULT_PIXEL_ID;

/**
 * Nome do evento de conversão no Events Manager.
 *
 * É um evento PERSONALIZADO (`trackCustom`), não um dos padrão do Meta — a
 * lista de padrão é fechada (Lead, Purchase, CompleteRegistration...) e
 * "Reencaminhado" não está nela. Consequência prática: pra otimizar campanha
 * por ele, é preciso criar uma **Conversão personalizada** no Events Manager
 * apontando pra este nome. Sem isso ele aparece nos relatórios mas não fica
 * disponível como objetivo de otimização.
 */
export const CONVERSION_EVENT = 'Reencaminhado';

/**
 * Quanto esperamos o pixel antes de navegar pra fora.
 *
 * O `fbq('track')` não devolve callback: ele monta uma requisição pro
 * facebook.com/tr e volta na hora. Se a página navegar no mesmo instante, o
 * navegador CANCELA essa requisição e a conversão nunca chega ao Meta — era
 * exatamente por isso que o painel contava redirecionamentos que o Events
 * Manager não via. Essa folga curta é o que deixa o beacon sair.
 */
export const PIXEL_FLUSH_MS = 400;

let started = false;

/**
 * Snippet oficial do Meta, escrito por extenso em vez do blob minificado.
 * Cria a fila do `fbq` na hora e carrega o `fbevents.js` de forma assíncrona —
 * eventos disparados antes do script chegar ficam na fila e saem depois.
 */
function ensureFbq(): void {
  if (window.fbq) return;

  const fbq: any = function (...args: unknown[]) {
    fbq.callMethod ? fbq.callMethod.apply(fbq, args) : fbq.queue.push(args);
  };
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.push = fbq;

  window.fbq = fbq;
  (window as any)._fbq = fbq;

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);
}

/**
 * País do visitante em ISO 3166-1 alpha-2 minúsculo (`br`), no formato que o
 * Meta espera.
 *
 * Sai do fuso horário do navegador e, na falta dele, do idioma. É o único campo
 * de Advanced Matching além do `external_id` que dá pra preencher sem pedir
 * nada à pessoa, e o Meta pede explicitamente que o país vá sempre junto.
 *
 * Vale a ressalva: é DEDUZIDO, não declarado. Pra quem usa VPN ou está viajando
 * pode sair errado — mas o fuso do navegador é o sinal mais confiável que
 * existe sem uma chamada de rede a mais numa página que dura 4 segundos.
 */
function browserCountry(): string | null {
  // Fusos do Brasil. A LP é de um jogo brasileiro: cobrir isso bem vale mais
  // que uma tabela mundial que ficaria desatualizada.
  const BR_ZONES = /^America\/(Sao_Paulo|Bahia|Fortaleza|Recife|Belem|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Rio_Branco|Boa_Vista|Maceio|Araguaina|Santarem|Eirunepe|Noronha)$/;

  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    if (BR_ZONES.test(zone)) return 'br';
  } catch {
    // Intl indisponível: cai no idioma.
  }

  try {
    // `pt-BR` -> `br`. Só aceita o formato com região, senão não dá pra saber.
    const locale = navigator.language ?? '';
    const region = locale.split('-')[1];
    if (region && /^[A-Za-z]{2}$/.test(region)) return region.toLowerCase();
  } catch {
    // navigator.language indisponível.
  }

  return null;
}

/**
 * Monta o Advanced Matching com tudo que a LP tem de verdade.
 *
 * Campo vazio é REMOVIDO em vez de ir como null: o pixel normaliza e faz o
 * hash do que receber, e um valor vazio viraria um hash que não casa com
 * ninguém — pior que não mandar o campo.
 *
 * Os valores vão CRUS. Quem faz o hash (sha256) é o próprio `fbevents.js`, no
 * navegador — é assim que o Advanced Matching do pixel funciona, ao contrário
 * da Conversions API, onde o hash é responsabilidade de quem manda.
 */
function buildAdvancedMatching(externalId: string): Record<string, string> {
  const data: Record<string, string | null> = {
    external_id: externalId || null,
    country: browserCountry(),
    // Quando a LP passar a coletar, é aqui que entram: em, ph, fn, ln, db, ge,
    // ct, st, zp. O pixel aceita todos, crus, e faz o hash sozinho.
  };

  return Object.fromEntries(
    Object.entries(data).filter(([, v]) => !!v),
  ) as Record<string, string>;
}

/** Tira nulos/vazios dos parâmetros do evento — ruído não ajuda ninguém. */
function clean(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  );
}

/**
 * DISPARO 1 — abertura da LP.
 *
 * Precisa rodar o quanto antes: é o `fbevents.js` que cria o cookie `_fbp`, e
 * a conversão (que acontece ~4s depois) só consegue mandar esse identificador
 * se o pixel já tiver rodado. Chamar mais de uma vez é inofensivo — o PageView
 * sai uma vez só por carregamento.
 *
 * O `eventId` vai no `eventID` do evento. Hoje ninguém deduplica PageView, mas
 * mandar já deixa pronto pro dia em que a Conversions API entrar.
 */
export function initMetaPixel(opts: {
  externalId: string;
  eventId: string;
  params?: Record<string, unknown>;
}): void {
  if (started) return;
  started = true;

  try {
    // ANTES do init: se esta visita não trouxe `?fbclid=` mas a pessoa já
    // clicou num anúncio nos últimos 90 dias, devolve o parâmetro pra URL pro
    // pixel conseguir montar o `fbc` — o identificador que mais pesa na
    // qualidade da correspondência.
    const restored = restoreFbclidToUrl();

    ensureFbq();

    const matching = buildAdvancedMatching(opts.externalId);
    window.fbq('init', META_PIXEL_ID, matching);
    window.fbq('track', 'PageView', clean(opts.params ?? {}), { eventID: opts.eventId });

    console.log(
      `%c[PIXEL] PageView -> ${META_PIXEL_ID} | matching: ${Object.keys(matching).join(', ') || 'nenhum'}${restored ? ' | fbclid restaurado' : ''}`,
      'color: #3b82f6; font-weight: bold;',
    );
  } catch (e) {
    // Adblock, rede fora, cookies bloqueados: o pixel se perde, mas a LP
    // (e principalmente o redirecionamento) NÃO pode quebrar por causa disso.
    console.error('[PIXEL] Falha ao iniciar o pixel do Meta:', e);
  }
}

/**
 * DISPARO 2 — saída pro jogo (a conversão).
 *
 * `trackCustom` porque "Reencaminhado" não é evento padrão do Meta (ver
 * `CONVERSION_EVENT`). O Advanced Matching definido no `init` continua valendo
 * aqui — não precisa repetir.
 *
 * `eventId` é o id único desta conversão. Ele vai no TERCEIRO argumento do
 * `track` (`eventID`), que é onde o Meta espera — serve pra deduplicar quando o
 * mesmo evento também for mandado pelo servidor (Conversions API): os dois lados
 * mandam o mesmo id e o Meta conta uma vez só.
 *
 * A promise resolve depois da folga de flush, pra quem for navegar pra fora
 * poder esperar. Nunca rejeita.
 */
export function trackMetaConversion(opts: {
  eventId: string;
  params?: Record<string, unknown>;
}): Promise<void> {
  try {
    ensureFbq();
    window.fbq('trackCustom', CONVERSION_EVENT, clean(opts.params ?? {}), { eventID: opts.eventId });
    console.log(
      `%c[PIXEL] ${CONVERSION_EVENT} (conversão) -> ${META_PIXEL_ID}`,
      'color: #22c55e; font-weight: bold;',
    );
  } catch (e) {
    console.error('[PIXEL] Falha ao disparar a conversão:', e);
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, PIXEL_FLUSH_MS));
}
