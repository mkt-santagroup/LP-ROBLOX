/// <reference types="vite/client" />
//
// Pixel do Meta — DOIS eventos, e só esses dois:
//
//   1. PageView  -> quando a pessoa abre a LP
//   2. Lead      -> quando ela é mandada pro jogo (A CONVERSÃO)
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
 * Evento padrão do Meta usado pra conversão. Evento PADRÃO (e não um
 * `trackCustom`) porque só eles servem pra otimização de campanha e criação de
 * público parecido.
 */
export const CONVERSION_EVENT = 'Lead';

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
 * DISPARO 1 — abertura da LP.
 *
 * Precisa rodar o quanto antes: é o `fbevents.js` que cria o cookie `_fbp`, e
 * a conversão (que acontece ~4s depois) só consegue mandar esse identificador
 * se o pixel já tiver rodado. Chamar mais de uma vez é inofensivo — o PageView
 * sai uma vez só por carregamento.
 *
 * `externalId` é o `visitor_id` da LP. Vai no `init` como Advanced Matching:
 * é o ÚNICO dado de identificação que esta página tem (ela não pede e-mail nem
 * telefone) e é o que ajuda o Meta a ligar o evento a uma pessoa real. Pode ir
 * cru — o próprio pixel faz o hash no navegador.
 */
export function initMetaPixel(externalId?: string): void {
  if (started) return;
  started = true;

  try {
    ensureFbq();
    window.fbq('init', META_PIXEL_ID, externalId ? { external_id: externalId } : {});
    window.fbq('track', 'PageView');
    console.log(`%c[PIXEL] PageView -> ${META_PIXEL_ID}`, 'color: #3b82f6; font-weight: bold;');
  } catch (e) {
    // Adblock, rede fora, cookies bloqueados: o pixel se perde, mas a LP
    // (e principalmente o redirecionamento) NÃO pode quebrar por causa disso.
    console.error('[PIXEL] Falha ao iniciar o pixel do Meta:', e);
  }
}

/**
 * DISPARO 2 — saída pro jogo (a conversão).
 *
 * `eventId` é o id único desta conversão. Ele vai no TERCEIRO argumento do
 * `track` (`eventID`), que é onde o Meta espera — serve pra deduplicar quando o
 * mesmo evento também for mandado pelo servidor (Conversions API): os dois lados
 * mandam o mesmo id e o Meta conta uma vez só.
 *
 * A promise resolve depois da folga de flush, pra quem for navegar pra fora
 * poder esperar. Nunca rejeita.
 */
export function trackMetaConversion(eventId: string): Promise<void> {
  try {
    ensureFbq();
    window.fbq('track', CONVERSION_EVENT, {}, { eventID: eventId });
    console.log(`%c[PIXEL] ${CONVERSION_EVENT} (conversão) -> ${META_PIXEL_ID}`, 'color: #22c55e; font-weight: bold;');
  } catch (e) {
    console.error('[PIXEL] Falha ao disparar a conversão:', e);
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, PIXEL_FLUSH_MS));
}
