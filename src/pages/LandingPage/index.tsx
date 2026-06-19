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

// Libera o botão quando a pessoa assistiu acima de 75% do VÍDEO REAL
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
      // Se a rota tem influenciador cadastrado, usa o vídeo DELE
      if (influencer) {
        const inf = await getInfluencerBySlug(slugify(influencer));
        if (inf?.video_url) base.videoUrl = inf.video_url;
      }
      if (active) setData(base);
    })();
    return () => { active = false; };
  }, [influencer]);

  // Acompanha o progresso REAL do vídeo (currentTime / duração) e libera o botão
  // assim que a pessoa passa de 75% assistido — funciona pra vídeo de qualquer duração.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      if (!video.duration || isNaN(video.duration)) return;
      const pct = Math.min((video.currentTime / video.duration) * 100, 100);
      videoProgressRef.current = Math.max(videoProgressRef.current, pct);
      setVideoProgress(prev => Math.max(prev, pct));

      if (videoProgressRef.current >= UNLOCK_PERCENT && state !== 'unlocked' && state !== 'blocked') {
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
      setTimeout(() => { window.location.href = data?.gameUrl; }, 350);
    } else if (state === 'watching') {
      trackBlockedClick();
      setState('blocked');
      setLabel('CALMAAA...');
      
      setTimeout(() => {
        if (videoProgressRef.current >= UNLOCK_PERCENT) {
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