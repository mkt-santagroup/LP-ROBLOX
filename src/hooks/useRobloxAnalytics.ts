import { useEffect, useRef } from 'react';
import { supabase, updateVisitorKeepalive } from '../lib/supabase';
import { slugify, getInfluencerBySlug } from '../lib/influencers';
import { initMetaPixel, trackMetaConversion, PIXEL_FLUSH_MS } from '../lib/metaPixel';
import {
  captureAdParams,
  getCampaignParams,
  getMetaIdentity,
  getVisitorId,
} from '../lib/metaIdentity';

// Declarar as variáveis globais do Meta e GTM pro TypeScript não reclamar
declare global {
  interface Window {
    fbq: any;
    dataLayer: any[];
  }
}

interface TrackingOrigin {
  influencer?: string;
  social?: string;
}

/** Como a pessoa saiu da LP pro jogo. */
export type RedirectMode = 'auto' | 'manual';

/** Teto de espera pelo IP — é uma API externa, não pode segurar o cadastro. */
const IP_LOOKUP_TIMEOUT_MS = 2000;

/**
 * Teto de espera pelo tracking antes de navegar pra fora.
 *
 * Vale pros DOIS lados da conversão (a gravação no banco e o disparo do pixel),
 * e é sempre um TETO, não uma espera fixa: assim que os dois terminam, a
 * navegação acontece. A gravação vai com `keepalive` e sobrevive à saída da
 * página; o pixel NÃO tem essa garantia — se a gente navegar antes do beacon
 * sair, o navegador cancela e a conversão nunca chega ao Meta. Por isso o teto
 * cobre os dois, e não só o banco.
 */
export const TRACKING_FLUSH_MS = Math.max(600, PIXEL_FLUSH_MS + 200);

/**
 * Tracking da LP de redirecionamento.
 *
 * São dois disparos pro Meta, e só dois (ver `lib/metaPixel.ts`):
 *   PageView -> quando a pessoa abre a página;
 *   Reencaminhado -> quando ela é mandada pro jogo.
 *
 * Os `dataLayer.push` que sobraram existem só pro GTM (lado Google). O pixel do
 * Meta NÃO depende mais deles.
 */
export function useRobloxAnalytics(origin?: TrackingOrigin) {
  const visitorId = useRef<string>('');

  // Toques no link de escape ("Não abriu? Toque aqui pra entrar")
  const manualClicks = useRef<number>(0);
  // O StrictMode do dev monta o componente duas vezes — sem isto o `page_view`
  // sairia em dobro pro GTM. (O pixel do Meta tem guarda própria em metaPixel.ts.)
  const pageViewPushed = useRef<boolean>(false);
  // Garante que o MODO da saída (auto/manual) seja gravado uma vez só
  const redirectTracked = useRef<boolean>(false);
  // Resolve quando a linha do visitante já existe no banco. A saída pro jogo
  // espera por isso — um UPDATE numa linha que ainda não nasceu não grava nada.
  const visitorReady = useRef<Promise<void> | null>(null);

  const getDeviceType = () => {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return "tablet";
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) return "mobile";
    return "desktop";
  };

  // Normaliza os pedaços da URL (/influenciador/rede-social) que vêm da rota
  const cleanSlug = (value?: string) => {
    if (!value) return null;
    try {
      value = decodeURIComponent(value);
    } catch {
      // se vier um % quebrado, segue com o valor original
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  // Slug do influenciador padronizado (igual ao cadastro): "Nathan" -> "nathan"
  const rawInfluencerSlug = origin?.influencer ? (slugify(origin.influencer) || null) : null;
  // Rede social padronizada em minúsculo (instagram, tiktok, youtube...)
  const rawSocial = cleanSlug(origin?.social)?.toLowerCase() ?? null;

  /**
   * Contexto que acompanha os DOIS eventos do pixel.
   *
   * Isto não é Advanced Matching (esse é montado em `metaPixel.ts` e só aceita
   * a lista fechada do Meta) — são parâmetros personalizados, que aparecem no
   * Events Manager e servem pra montar Conversões personalizadas e públicos
   * ("quem veio do TikTok do fulano", "quem teve que clicar no link manual").
   *
   * Os `utm_*` e os ids de campanha/conjunto/anúncio vêm da URL do anúncio e
   * são o que permite, depois, dizer qual ANÚNCIO específico trouxe quem
   * converteu.
   */
  const eventParams = (extra?: Record<string, unknown>) => ({
    ...(getCampaignParams() ?? {}),
    influencer: rawInfluencerSlug,
    rede_social: rawSocial,
    device: getDeviceType(),
    ...extra,
  });

  // Devolve a promise pra quem precisar esperar a gravação terminar antes de
  // navegar pra fora (a LP de redirect faz isso, com timeout). Nunca lança:
  // se o banco estiver fora do ar, o tracking falha em silêncio e a página segue.
  // Devolve se a gravação foi de fato aceita — quem escreve colunas novas usa
  // isso pra repetir sem elas quando a migration ainda não rodou. O supabase-js
  // não LANÇA nesse caso: ele devolve o erro no resultado, então checar só o
  // try/catch deixava passar como sucesso uma escrita que o banco recusou.
  const updateSession = async (dataToUpdate: any): Promise<boolean> => {
    if (!visitorId.current) return false;
    try {
      const { error } = await supabase.from('lp_roblox').update(dataToUpdate).eq('visitor_id', visitorId.current);
      if (error) {
        console.error('[Analytics] Erro ao atualizar sessão:', error.message);
        return false;
      }
      return true;
    } catch (error) {
      console.error('[Analytics] Erro ao atualizar sessão:', error);
      return false;
    }
  };

  useEffect(() => {
    // ANTES de qualquer coisa: os parâmetros do anúncio (fbclid, utm_*) só
    // existem na URL deste acesso, e esta página navega pra fora em segundos.
    // O que não for lido agora está perdido — não dá pra recuperar depois.
    captureAdParams();

    const currentVisitorId = getVisitorId();
    visitorId.current = currentVisitorId;

    // ===== DISPARO 1 DE 2: PageView =====
    // Logo aqui, antes de qualquer ida ao banco: é o pixel que cria o cookie
    // `_fbp`, e a conversão (~4s depois) só manda esse identificador se ele já
    // tiver nascido. Nada nesta linha depende do Supabase — se o banco estiver
    // fora do ar, o pixel dispara do mesmo jeito.
    //
    // Os parâmetros usam o slug CRU da URL, sem esperar a validação no banco:
    // o pixel não pode ficar atrás de uma ida ao Supabase. Se o influenciador
    // não existir cadastrado, o painel trata como acesso normal — o parâmetro
    // no evento continua sendo a informação verdadeira de por onde a pessoa veio.
    initMetaPixel({
      externalId: currentVisitorId,
      eventId: crypto.randomUUID(),
      params: eventParams(),
    });

    // Busca o IP numa API externa. Bounded: se ela demorar/cair, o cadastro do
    // visitante segue sem IP em vez de ficar preso esperando.
    const fetchIp = async (): Promise<string | null> => {
      try {
        const response = await fetch('https://api.ipify.org?format=json', {
          signal: AbortSignal.timeout(IP_LOOKUP_TIMEOUT_MS),
        });
        const data = await response.json();
        return data.ip || null;
      } catch (e) {
        console.error("Erro ao obter IP:", e);
        return null;
      }
    };

    const initVisitor = async () => {
      try {
      const identity = getMetaIdentity();
      const campaign = getCampaignParams();

      if (identity.fbclid) {
        console.log(`%c[TRACKING] Veio de anúncio — fbclid capturado.`, "color: #3b82f6;");
      }
      // Só pro GTM (lado Google). O pixel do Meta já disparou sozinho acima.
      if (window.dataLayer && !pageViewPushed.current) {
        pageViewPushed.current = true;
        window.dataLayer.push({ event: 'page_view' });
      }

      const deviceType = getDeviceType();

      // VALIDAÇÃO: só conta como origem de influenciador se ele EXISTIR cadastrado.
      // /satorogojo (não cadastrado) -> acesso normal, sem criar nada.
      //
      // Vai junto com a leitura da linha existente: são duas idas ao mesmo banco,
      // e na LP de redirect cada ida a menos é tempo a menos de risco de a pessoa
      // ser mandada pro jogo antes de existir linha pra registrar isso.
      const [infRow, existing] = await Promise.all([
        rawInfluencerSlug ? getInfluencerBySlug(rawInfluencerSlug) : Promise.resolve(null),
        supabase.from('lp_roblox').select('*').eq('visitor_id', currentVisitorId).maybeSingle(),
      ]);

      let influencer: string | null = null;
      let social: string | null = null;
      if (rawInfluencerSlug) {
        if (infRow) {
          influencer = rawInfluencerSlug;
          social = rawSocial;
        } else {
          console.log(`%c[TRACKING] /${rawInfluencerSlug} não é influenciador cadastrado — tratando como acesso normal.`, "color: #8b8b93;");
        }
      }

      const data = existing.data;

      // O IP fica pra DEPOIS do cadastro de propósito: ele vem de uma API de
      // terceiro e é o passo mais lento de todos. Gravar a linha primeiro é o
      // que garante que uma saída pro jogo logo em seguida tenha onde ser
      // registrada — o IP é complemento, o registro da pessoa não é.

      // Colunas novas (migration 20260803). Enquanto ela não roda, o PostgREST
      // recusa a linha INTEIRA por causa delas — e o visitante sumiria do
      // painel. Por isso toda escrita aqui é "tenta cheio, cai pro básico":
      // perder o dado do anúncio é chato, perder o registro da pessoa (e a
      // conversão que vem depois dele) seria bem pior.
      const adColumns = {
        fbclid: identity.fbclid,
        fbc: identity.fbc,
        fbp: identity.fbp,
        campaign_params: campaign,
      };
      const avisarMigration = () => console.warn(
        '[Analytics] Não consegui gravar os identificadores do Meta — a causa mais ' +
        'provável é a migration supabase/migrations/20260803_add_meta_ad_identifiers_to_lp_roblox.sql ' +
        'ainda não ter rodado. O acesso foi registrado sem eles.',
      );

      if (!data) {
        const base = {
          visitor_id: currentVisitorId,
          page_views: 1,
          device_type: deviceType,
          // Origem do tráfego (só preenchida se o influenciador existir)
          influencer: influencer,
          social_network: social
        };

        const { error: insertError } = await supabase.from('lp_roblox').insert([{ ...base, ...adColumns }]);
        if (insertError) {
          avisarMigration();
          await supabase.from('lp_roblox').insert([base]);
        }
        if (influencer) {
          console.log(`%c[TRACKING] Origem: ${influencer}${social ? ` / ${social}` : ''}`, "color: #a855f7; font-weight: bold;");
        }
      } else {
        manualClicks.current = data.manual_clicks || 0;

        const basePayload: any = {
          page_views: (data.page_views || 0) + 1,
          device_type: deviceType
        };

        // First-touch: só grava a origem se ainda não houver uma salva para esse visitante
        if (influencer && !data.influencer) basePayload.influencer = influencer;
        if (social && !data.social_network) basePayload.social_network = social;

        // Anúncio é LAST-touch, ao contrário da origem acima: se a pessoa voltou
        // por um anúncio novo, é esse clique novo que o Meta quer atribuir.
        // Só entram os campos com valor de verdade — num acesso direto (ou com o
        // localStorage bloqueado) eles vêm vazios e não podem apagar o que já
        // estava gravado.
        const adUpdates = Object.fromEntries(
          Object.entries(adColumns).filter(([, value]) => !!value),
        );

        const ok = await updateSession({ ...basePayload, ...adUpdates });
        // Só faz sentido repetir sem as colunas novas se elas de fato foram
        // tentadas — senão o retry seria idêntico ao que acabou de falhar.
        if (!ok && Object.keys(adUpdates).length > 0) {
          avisarMigration();
          await updateSession(basePayload);
        }
      }
      } catch (error) {
        // Banco fora do ar / rede caída: o tracking se perde, mas a página
        // (e principalmente o redirecionamento) NÃO pode quebrar por causa disso.
        console.error('[Analytics] Falha ao registrar o visitante:', error);
      }
    };

    // Quem for gravar a saída pro jogo espera por esta promise.
    visitorReady.current = initVisitor();

    // Complementa a linha com o IP quando (e se) ele chegar. Fora do
    // `visitorReady` porque ninguém precisa esperar por isso.
    visitorReady.current.then(async () => {
      const ip = await fetchIp();
      if (ip) await updateSession({ ip_address: ip });
    });
  }, []);

  return {
    /**
     * Saída pro jogo — a conversão da LP de redirecionamento.
     *
     * `mode` guarda COMO a pessoa saiu:
     *   'auto'   -> o timer estourou e a página navegou sozinha;
     *   'manual' -> ela tocou no link de escape ANTES do timer estourar.
     *
     * Muito 'manual' quer dizer que a espera está longa demais (ou que o
     * navegador in-app está bloqueando o redirect) — é exatamente esse número
     * que o painel separa do total.
     */
    trackRedirect: async (mode: RedirectMode): Promise<boolean> => {
      if (mode === 'manual') manualClicks.current += 1;

      // O modo da saída já foi gravado: um toque no link depois disso é a
      // pessoa insistindo porque o automático não pegou. Não reescreve o modo,
      // nem repete o pixel (a conversão é UMA por acesso) — só engrossa o
      // contador de toques, que é o sinal de redirect travado.
      if (redirectTracked.current) {
        return updateVisitorKeepalive(visitorId.current, { manual_clicks: manualClicks.current });
      }
      redirectTracked.current = true;

      // ID único DESTA conversão. Serve pra deduplicar quando o mesmo evento for
      // mandado também pelo servidor (Conversions API): os dois lados mandam o
      // mesmo `event_id` e o Meta conta uma vez só. Fica salvo no banco
      // justamente pra que o envio server-side, quando existir, reuse este id.
      const eventId = crypto.randomUUID();

      // Releitura da identidade: na primeira visita o `_fbp` ainda não existia
      // quando a página montou (quem cria é o pixel). Aqui já se passaram os
      // segundos da tela de espera, então ele normalmente já está lá.
      const identity = getMetaIdentity();

      // ===== DISPARO 2 DE 2: a conversão =====
      // Começa AGORA, antes das esperas do banco, pra ter o máximo de tempo de
      // beacon antes de a página navegar pra fora.
      const pixelFlushed = trackMetaConversion({
        eventId,
        params: eventParams({
          // Como a pessoa saiu: sozinha no timer ou tocando no link de escape.
          redirect_mode: mode,
          // Quanto tempo ela ficou na tela de espera. Serve pra separar, no
          // Events Manager, quem esperou de quem saiu correndo.
          tempo_na_pagina_ms: Math.round(performance.now()),
        }),
      });

      // Só pro GTM (lado Google) — o pixel do Meta já foi na linha de cima.
      if (window.dataLayer) {
        window.dataLayer.push({ event: 'entrou_no_jogo', event_id: eventId, redirect_mode: mode });
      }

      // A linha do visitante nasce de forma assíncrona no primeiro acesso. Sem
      // esperar por ela, um redirect rápido faria o UPDATE não achar linha
      // nenhuma — e a saída sumiria da contagem justamente nos acessos mais
      // rápidos. É por isso que "de fato foram redirecionadas" era subestimado.
      if (visitorReady.current) await visitorReady.current;

      const gravar = async (): Promise<boolean> => {
        const ok = await updateVisitorKeepalive(visitorId.current, {
          click_link: true,
          redirect_mode: mode,
          redirected_at: new Date().toISOString(),
          manual_clicks: manualClicks.current,
          conversion_event_id: eventId,
          // Podem ter nascido depois do cadastro inicial — o `_fbp` em especial.
          fbc: identity.fbc,
          fbp: identity.fbp,
        });
        if (ok) return true;

        // Deu ruim gravando o detalhe — o caso mais provável é uma das migrations
        // (20260801_add_redirect_tracking / 20260803_add_meta_ad_identifiers)
        // ainda não ter rodado, e aí o PostgREST recusa o UPDATE inteiro por
        // causa das colunas novas. Tenta de novo só com `click_link`: perder o
        // detalhe é chato, perder a conversão inteira seria bem pior.
        console.warn('[Analytics] Não consegui gravar o detalhe do redirect — confira se as migrations rodaram. Registrando só a conversão.');
        return updateVisitorKeepalive(visitorId.current, { click_link: true });
      };

      // Banco e pixel correm juntos: são independentes, e esperar um depois do
      // outro dobraria o tempo que a pessoa fica parada na tela de espera.
      const [ok] = await Promise.all([gravar(), pixelFlushed]);
      return ok;
    }
  };
}
