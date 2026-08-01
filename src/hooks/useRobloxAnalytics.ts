import { useEffect, useRef, RefObject } from 'react';
import { supabase } from '../lib/supabase';
import { slugify, getInfluencerBySlug } from '../lib/influencers';

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
  const updateSession = async (dataToUpdate: any) => {
    if (!visitorId.current) return;
    try {
      await supabase.from('lp_roblox').update(dataToUpdate).eq('visitor_id', visitorId.current);
    } catch (error) {
      console.error('[Analytics] Erro ao atualizar sessão:', error);
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
    const storedId = localStorage.getItem('roblox_analytics_visitor_id');
    const currentVisitorId = storedId || crypto.randomUUID();
    if (!storedId) localStorage.setItem('roblox_analytics_visitor_id', currentVisitorId);
    visitorId.current = currentVisitorId;

    const initVisitor = async () => {
      try {
      // --- LOG DE TRACKING (PAGEVIEW) ---
      if (!pageViewFired.current) {
        console.log(`%c[TRACKING] Disparando evento: PageView`, "color: #3b82f6; font-weight: bold;");
        if (window.dataLayer) window.dataLayer.push({ event: 'page_view' });
        pageViewFired.current = true;
      }

      let userIp = "0.0.0.0";
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        userIp = data.ip;
      } catch (e) {
        console.error("Erro ao obter IP:", e);
      }

      const deviceType = getDeviceType();

      // VALIDAÇÃO: só conta como origem de influenciador se ele EXISTIR cadastrado.
      // /satorogojo (não cadastrado) -> acesso normal, sem criar nada.
      let influencer: string | null = null;
      let social: string | null = null;
      if (rawInfluencerSlug) {
        const inf = await getInfluencerBySlug(rawInfluencerSlug);
        if (inf) {
          influencer = rawInfluencerSlug;
          social = rawSocial;
        } else {
          console.log(`%c[TRACKING] /${rawInfluencerSlug} não é influenciador cadastrado — tratando como acesso normal.`, "color: #8b8b93;");
        }
      }

      const { data } = await supabase.from('lp_roblox').select('*').eq('visitor_id', currentVisitorId).maybeSingle();

      if (!data) {
        await supabase.from('lp_roblox').insert([{
          visitor_id: currentVisitorId,
          page_views: 1,
          ip_address: userIp,
          device_type: deviceType,
          // Origem do tráfego (só preenchida se o influenciador existir)
          influencer: influencer,
          social_network: social
        }]);
        if (influencer) {
          console.log(`%c[TRACKING] Origem: ${influencer}${social ? ` / ${social}` : ''}`, "color: #a855f7; font-weight: bold;");
        }
      } else {
        clickCalmaCount.current = data.click_calma || 0;
        highestExactProgress.current = data.exact_percentage_viewed || 0;
        highestMaxProgress.current = data.max_percentage_viewed || 0;

        const updatePayload: any = {
          page_views: (data.page_views || 0) + 1,
          ip_address: userIp,
          device_type: deviceType
        };

        // First-touch: só grava a origem se ainda não houver uma salva para esse visitante
        if (influencer && !data.influencer) updatePayload.influencer = influencer;
        if (social && !data.social_network) updatePayload.social_network = social;

        await updateSession(updatePayload);
      }
      } catch (error) {
        // Banco fora do ar / rede caída: o tracking se perde, mas a página
        // (e principalmente o redirecionamento) NÃO pode quebrar por causa disso.
        console.error('[Analytics] Falha ao registrar o visitante:', error);
      }
    };

    initVisitor();
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
    trackLinkClick: () => {
      // Conversão REAL — só dispara aqui (botão liberado, indo pro jogo). Nunca no "calma".
      console.log(`%c[TRACKING] dataLayer -> entrou_no_jogo (CONVERSÃO)`, "color: #22c55e; font-weight: bold;");
      if (window.dataLayer) window.dataLayer.push({ event: 'entrou_no_jogo' });

      // Devolve a promise: a LP de redirect espera (com timeout) pra a gravação
      // não ser cancelada pela navegação pra fora do site.
      return updateSession({ click_link: true });
    }
  };
}