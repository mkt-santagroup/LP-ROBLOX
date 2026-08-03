import { useEffect, useRef, RefObject } from 'react';
import { supabase, updateVisitorKeepalive } from '../lib/supabase';
import { slugify, getInfluencerBySlug } from '../lib/influencers';
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
 * Vale pros DOIS lados da conversão (gravação no banco e disparo do pixel via
 * GTM), e é sempre um TETO, não uma espera fixa: assim que os dois terminam, a
 * navegação acontece. Na prática o GTM já foi carregado lá no início da página
 * e a tag está quente quando a conversão dispara, então o normal é resolver em
 * bem menos que isso.
 */
export const TRACKING_FLUSH_MS = 600;

/**
 * Empurra um evento pro GTM e espera as tags DELE dispararem.
 *
 * `dataLayer.push` volta na hora — quem manda a requisição pro Meta é a tag, de
 * forma assíncrona. Como a LP navega pra fora logo em seguida, sem esperar por
 * isso o navegador CANCELA o beacon do pixel e a conversão nunca chega ao Meta.
 * Era esse o furo: o registro no banco já estava protegido com `keepalive`, o
 * lado do pixel não estava — então o painel contava redirecionamentos que o
 * Events Manager nunca via.
 *
 * `eventCallback` é o retorno do próprio GTM avisando "as tags desse evento já
 * foram"; `eventTimeout` faz o GTM chamar esse retorno mesmo se alguma tag
 * travar. O `setTimeout` local cobre o caso de o GTM não existir (bloqueado por
 * adblock), quando callback nenhum viria.
 */
function pushAndFlush(payload: Record<string, unknown>, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (!window.dataLayer) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    window.dataLayer.push({ ...payload, eventTimeout: timeoutMs, eventCallback: finish });
    setTimeout(finish, timeoutMs);
  });
}

export function useRobloxAnalytics(
  // `null` = página sem vídeo (a LP de redirecionamento). Todo o tracking de
  // progresso de vídeo simplesmente não roda, o resto (pageview, conversão)
  // continua igual.
  videoRef: RefObject<HTMLVideoElement | null> | null,
  origin?: TrackingOrigin
) {
  const visitorId = useRef<string>('');
  const clickCalmaCount = useRef<number>(0);
  const highestExactProgress = useRef<number>(0);
  const highestMaxProgress = useRef<number>(0);
  // Garante que o "Play" (click_start + pixel) seja contado UMA vez, no play real
  const playStartedRef = useRef<boolean>(false);

  // Toques no link de escape ("Não abriu? Toque aqui pra entrar")
  const manualClicks = useRef<number>(0);
  // Garante que o MODO da saída (auto/manual) seja gravado uma vez só
  const redirectTracked = useRef<boolean>(false);
  // Resolve quando a linha do visitante já existe no banco. A saída pro jogo
  // espera por isso — um UPDATE numa linha que ainda não nasceu não grava nada.
  const visitorReady = useRef<Promise<void> | null>(null);

  // Controle para disparar o PageView apenas uma vez por carregamento
  const pageViewFired = useRef<boolean>(false);

  // Usar um Set local para a sessão atual, assim o pixel dispara sempre que você testar (dar F5)
  const sessionMilestones = useRef<Set<number>>(new Set());

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

  // Marca o início do vídeo (Play) só uma vez — disparado no play real do vídeo,
  // independente de ter sido pelo CTA ou pelo botão do player.
  const markPlayStarted = () => {
    if (playStartedRef.current) return;
    playStartedRef.current = true;
    console.log(`%c[TRACKING] dataLayer -> video_play`, "color: #f59e0b; font-weight: bold;");
    if (window.dataLayer) window.dataLayer.push({ event: 'video_play' });
    updateSession({ click_start: true });
  };

  useEffect(() => {
    // ANTES de qualquer coisa: os parâmetros do anúncio (fbclid, utm_*) só
    // existem na URL deste acesso, e esta página navega pra fora em segundos.
    // O que não for lido agora está perdido — não dá pra recuperar depois.
    captureAdParams();

    const currentVisitorId = getVisitorId();
    visitorId.current = currentVisitorId;

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

      // --- LOG DE TRACKING (PAGEVIEW) ---
      if (!pageViewFired.current) {
        console.log(`%c[TRACKING] Disparando evento: PageView`, "color: #3b82f6; font-weight: bold;");
        if (identity.fbclid) {
          console.log(`%c[TRACKING] Veio de anúncio — fbclid capturado.`, "color: #3b82f6;");
        }
        // A identidade vai junto do primeiro evento pra ficar disponível no
        // modelo de dados do GTM desde o começo — qualquer tag posterior
        // consegue ler, sem depender de a gente repetir em todo push.
        // O `fbp` costuma vir null aqui (o pixel ainda não rodou); ele é lido de
        // novo na conversão, e o push de lá sobrescreve este.
        if (window.dataLayer) {
          window.dataLayer.push({
            event: 'page_view',
            external_id: identity.externalId,
            fbc: identity.fbc,
            fbp: identity.fbp,
          });
        }
        pageViewFired.current = true;
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
        clickCalmaCount.current = data.click_calma || 0;
        highestExactProgress.current = data.exact_percentage_viewed || 0;
        highestMaxProgress.current = data.max_percentage_viewed || 0;
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

  useEffect(() => {
    const video = videoRef?.current;
    // Página sem vídeo (LP de redirect) ou vídeo ainda não montado: nada a fazer.
    if (!video) return;

    const handleTimeUpdate = () => {
      if (!video.duration || video.duration === 0) return;

      const progress = (video.currentTime / video.duration) * 100;
      const currentRounded = Math.floor(progress);

      if (currentRounded > highestExactProgress.current) {
        highestExactProgress.current = currentRounded;
        updateSession({ exact_percentage_viewed: currentRounded });
      }

      const checkPoints = [25, 50, 75, 95, 100];
      checkPoints.forEach((point) => {
        const threshold = point === 100 ? 99 : point;

        if (progress >= threshold && !sessionMilestones.current.has(point)) {
          sessionMilestones.current.add(point);

          // --- LOG DE TRACKING (PORCENTAGEM) ---
          console.log(`%c[TRACKING] dataLayer -> video_progress ${point}%`, "color: #f59e0b; font-weight: bold;");

          if (window.dataLayer) window.dataLayer.push({ event: 'video_progress', percent: point });

          if (point > highestMaxProgress.current) {
            highestMaxProgress.current = point;
            updateSession({ max_percentage_viewed: point });
          }
        }
      });
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', markPlayStarted); // <-- Play real do vídeo marca o "Deram Play"
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', markPlayStarted);
    };
  }, [videoRef, videoRef?.current]); // <-- AQUI ESTÁ A MÁGICA: Adicionado videoRef.current de volta!

  return {
    // Mantido por compatibilidade — o Play real é marcado pelo evento 'play' do vídeo.
    // Chamar aqui é idempotente (só conta uma vez).
    trackStartClick: () => markPlayStarted(),
    trackBlockedClick: () => {
      clickCalmaCount.current += 1;
      // Clique enquanto BLOQUEADO (calma) — evento separado, NÃO é conversão.
      console.log(`%c[TRACKING] dataLayer -> clique_bloqueado (NÃO é conversão)`, "color: #ef4444; font-weight: bold;");
      if (window.dataLayer) window.dataLayer.push({ event: 'clique_bloqueado' });
      updateSession({ click_calma: clickCalmaCount.current });
    },

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
      // pessoa insistindo porque o automático não pegou. Não reescreve o modo —
      // só engrossa o contador de toques, que é o sinal de redirect travado.
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

      console.log(`%c[TRACKING] dataLayer -> redirect_${mode} + entrou_no_jogo (CONVERSÃO)`, "color: #22c55e; font-weight: bold;");

      // A conversão é o ÚNICO evento cuja tag a gente espera antes de navegar —
      // é o que impede o navegador de cancelar o beacon do pixel na saída.
      // Começa AGORA, antes das esperas do banco, pra ter o máximo de tempo.
      const pixelFlushed = pushAndFlush(
        {
          // Nome que o pixel/GTM já escutam. Não mexer.
          event: 'entrou_no_jogo',
          // Deduplicação com o envio server-side.
          event_id: eventId,
          // Quem é a pessoa, no vocabulário do Meta.
          external_id: identity.externalId,
          fbc: identity.fbc,
          fbp: identity.fbp,
          // Contexto, pro GTM poder separar sem precisar de outro evento.
          redirect_mode: mode,
        },
        TRACKING_FLUSH_MS,
      );

      // Detalhe do modo — é diagnóstico interno, não conversão: não segura a
      // navegação esperando a tag dele.
      if (window.dataLayer) window.dataLayer.push({ event: `redirect_${mode}` });

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
