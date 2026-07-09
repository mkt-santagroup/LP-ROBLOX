import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Clouds } from '../../components/Clouds';
import { Header } from '../../components/Header';
import { CTAButton } from '../../components/CTAButton';
import { ProgressBar } from '../../components/ProgressBar';
import { VideoPlayer } from '../../components/VideoPlayer';
import { getMockData } from '../../lib/supabase';
import { getInfluencerBySlug, slugify } from '../../lib/influencers';
import styles from '../../App.module.css';
import { useRobloxAnalytics } from '../../hooks/useRobloxAnalytics';

// Regra PADRÃO (LP principal / influencer sem segundos definidos):
// libera quando a pessoa assistiu acima de 75% do VÍDEO REAL
// (detecta a duração automaticamente, sem timer fixo).
const UNLOCK_PERCENT = 75;

export const LandingPage = () => {
  const [data, setData] = useState<any>(null);
  const [state, setState] = useState<'initial' | 'watching' | 'blocked' | 'unlocked'>('initial');
  const [videoProgress, setVideoProgress] = useState(0); // % real do vídeo assistido (0-100)
  const videoProgressRef = useRef(0);                    // maior % atingido (pra ler nos handlers)
  const [isPlaying, setIsPlaying] = useState(false);
  const [label, setLabel] = useState('QUERO JOGAR!');

  const videoRef = useRef<HTMLVideoElement>(null);

  // Captura a origem do tráfego da URL: /:influencer/:social
  const { influencer, social } = useParams();
  const { trackStartClick, trackBlockedClick, trackLinkClick } = useRobloxAnalytics(videoRef, { influencer, social });

  useEffect(() => {
    let active = true;
    (async () => {
      const base = await getMockData();
      // Se a rota tem influenciador cadastrado, aplica as configs DELE:
      // vídeo próprio, segundos até liberar o botão e link de redirect.
      if (influencer) {
        const inf = await getInfluencerBySlug(slugify(influencer));
        if (inf) {
          if (inf.video_url) base.videoUrl = inf.video_url;
          base.unlockSeconds = inf.unlock_seconds; // null = regra padrão (75%)
          if (inf.redirect_url && inf.redirect_url.trim()) base.redirectUrl = inf.redirect_url.trim();
        }
      }
      if (active) {
        setData(base);
        // unlock_seconds === 0 -> botão liberado desde o início (sem gate de vídeo)
        if (base.unlockSeconds === 0) {
          setState('unlocked');
          setLabel('JOGAR AGORA');
          setVideoProgress(100); // barra cheia/verde já na entrada
        }
      }
    })();
    return () => { active = false; };
  }, [influencer]);

  // Acompanha o progresso REAL do vídeo (currentTime / duração) e libera o botão
  // assim que a pessoa passa de 75% assistido — funciona pra vídeo de qualquer duração.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      const dur = video.duration;
      if (!dur || isNaN(dur)) return;

      // Alvo em SEGUNDOS de vídeo assistido até liberar o botão:
      //   unlockSeconds == null -> regra padrão (75% da duração do vídeo)
      //   unlockSeconds  > 0    -> segundos definidos pelo influencer
      //   (unlockSeconds === 0 já foi liberado de início, sem passar por aqui)
      const unlockSeconds = data?.unlockSeconds;
      const targetSecs = unlockSeconds == null
        ? dur * (UNLOCK_PERCENT / 100)
        : unlockSeconds;

      // progresso 0-100 RUMO ao desbloqueio (a barra chega em 100% no instante de liberar)
      const pct = targetSecs > 0 ? Math.min((video.currentTime / targetSecs) * 100, 100) : 100;
      videoProgressRef.current = Math.max(videoProgressRef.current, pct);
      setVideoProgress(prev => Math.max(prev, pct));

      if (videoProgressRef.current >= 100 && state !== 'unlocked' && state !== 'blocked') {
        setState('unlocked');
        setLabel('JOGAR AGORA');
      }
    };

    video.addEventListener('timeupdate', onTime);
    return () => video.removeEventListener('timeupdate', onTime);
  }, [videoRef.current, state, data]);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    if (state === 'initial') {
      setState('watching');
      setLabel('JOGAR AGORA');
    }
  }, [state]);

  const handleCTA = () => {
    if (state === 'initial') {
      trackStartClick();
      handlePlay();
      window.scrollTo({ top: 200, behavior: 'smooth' });
    } else if (state === 'unlocked') {
      trackLinkClick();
      // Pequeno delay pro GTM/pixel disparar a conversão (entrou_no_jogo) ANTES
      // do redirect pro Roblox — senão a navegação pode cancelar o envio do evento.
      // redirectUrl = link custom do influencer; fallback pro link padrão da LP.
      setTimeout(() => { window.location.href = data?.redirectUrl || data?.gameUrl; }, 350);
    } else if (state === 'watching') {
      trackBlockedClick();
      setState('blocked');
      setLabel('CALMAAA...');
      
      setTimeout(() => {
        if (videoProgressRef.current >= 100) {
          setState('unlocked');
          setLabel('JOGAR AGORA');
        } else {
          setState('watching');
          setLabel('JOGAR AGORA');
        }
      }, 2000);
    }
  };

  return (
    <div className={styles.landingWrapper}>
      {/* Nuvens e Fundo renderizam IMEDIATAMENTE, tirando a sensação de tela travada */}
      <Clouds /> 
      
      {data && (
        <div className={styles.page}>
          <Header logoUrl={data.logoUrl} />
          <CTAButton state={state} onClick={handleCTA} label={label} />
          <ProgressBar progress={videoProgress} isUnlocked={state === 'unlocked'} />
          <VideoPlayer 
            videoUrl={data.videoUrl} 
            isPlaying={isPlaying} 
            onPlay={handlePlay} 
            onPause={() => setIsPlaying(false)} 
            videoRef={videoRef}
          />
        </div>
      )}
    </div>
  );
};