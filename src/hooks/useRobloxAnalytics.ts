import { useEffect, useRef, RefObject } from 'react';
import { supabase } from '../lib/supabase';

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
  videoRef: RefObject<HTMLVideoElement | null>,
  origin?: TrackingOrigin
) {
  const visitorId = useRef<string>('');
  const clickCalmaCount = useRef<number>(0);
  const highestExactProgress = useRef<number>(0);
  const highestMaxProgress = useRef<number>(0);
  
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

  const influencer = cleanSlug(origin?.influencer);
  // Rede social padronizada em minúsculo (instagram, tiktok, youtube...)
  const social = cleanSlug(origin?.social)?.toLowerCase() ?? null;

  const updateSession = async (dataToUpdate: any) => {
    if (!visitorId.current) return;
    try {
      await supabase.from('lp_roblox').update(dataToUpdate).eq('visitor_id', visitorId.current);
    } catch (error) {
      console.error('[Analytics] Erro ao atualizar sessão:', error);
    }
  };

  useEffect(() => {
    const storedId = localStorage.getItem('roblox_analytics_visitor_id');
    const currentVisitorId = storedId || crypto.randomUUID();
    if (!storedId) localStorage.setItem('roblox_analytics_visitor_id', currentVisitorId);
    visitorId.current = currentVisitorId;

    const initVisitor = async () => {
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
      const { data } = await supabase.from('lp_roblox').select('*').eq('visitor_id', currentVisitorId).maybeSingle();
      
      if (!data) {
        await supabase.from('lp_roblox').insert([{
          visitor_id: currentVisitorId,
          page_views: 1,
          ip_address: userIp,
          device_type: deviceType,
          // Origem do tráfego capturada da URL (/influenciador/rede-social)
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
    };

    initVisitor();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    // Se o vídeo ainda não estiver carregado na tela, não faz nada
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
          console.log(`%c[TRACKING] Disparando evento: Porcentagem_${point}%`, "color: #f59e0b; font-weight: bold;");
          
          if (window.fbq) window.fbq('trackCustom', `Porcentagem_${point}`);
          if (window.dataLayer) window.dataLayer.push({ event: 'video_progress', percent: point });

          if (point > highestMaxProgress.current) {
            highestMaxProgress.current = point;
            updateSession({ max_percentage_viewed: point });
          }
        }
      });
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [videoRef, videoRef.current]); // <-- AQUI ESTÁ A MÁGICA: Adicionado videoRef.current de volta!

  return {
    trackStartClick: () => {
      console.log(`%c[TRACKING] Disparando evento: Play`, "color: #f59e0b; font-weight: bold;");
      if (window.fbq) window.fbq('trackCustom', 'Play');
      if (window.dataLayer) window.dataLayer.push({ event: 'video_play' });
      
      updateSession({ click_start: true });
    },
    trackBlockedClick: () => {
      clickCalmaCount.current += 1;
      updateSession({ click_calma: clickCalmaCount.current });
    },
    trackLinkClick: () => {
      console.log(`%c[TRACKING] Disparando evento: Entrou no jogo`, "color: #22c55e; font-weight: bold;");
      if (window.fbq) window.fbq('trackCustom', 'Entrou no jogo');
      if (window.dataLayer) window.dataLayer.push({ event: 'entrou_no_jogo' });

      updateSession({ click_link: true });
    }
  };
}