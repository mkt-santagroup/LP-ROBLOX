import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clouds } from '../../components/Clouds';
import { Header } from '../../components/Header';
import { CTAButton } from '../../components/CTAButton';
import { ProgressBar } from '../../components/ProgressBar';
import { VideoPlayer } from '../../components/VideoPlayer';
import { getMockData } from '../../lib/supabase';
import styles from '../../App.module.css';
import { useRobloxAnalytics } from '../../hooks/useRobloxAnalytics';

const TOTAL_TIME = 20;
const UNLOCK_TIME = TOTAL_TIME * 0.90; // 80% do vídeo

export const LandingPage = () => {
  const [data, setData] = useState<any>(null);
  const [state, setState] = useState<'initial' | 'watching' | 'blocked' | 'unlocked'>('initial');
  const [elapsed, setElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [label, setLabel] = useState('QUERO JOGAR!');

  const videoRef = useRef<HTMLVideoElement>(null);
  const { trackStartClick, trackBlockedClick, trackLinkClick } = useRobloxAnalytics(videoRef);

  useEffect(() => {
    getMockData().then(setData);
  }, []);

  useEffect(() => {
    let interval: any;
    if (isPlaying && elapsed < TOTAL_TIME) {
      interval = setInterval(() => {
        setElapsed(prev => {
          const next = Math.min(prev + 0.25, TOTAL_TIME);
          if (next >= UNLOCK_TIME && state !== 'unlocked' && state !== 'blocked') {
            setState('unlocked');
            setLabel('JOGAR AGORA');
          }
          return next;
        });
      }, 250);
    }
    return () => clearInterval(interval);
  }, [isPlaying, elapsed, state]);

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
      window.location.href = data?.gameUrl;
    } else if (state === 'watching') {
      trackBlockedClick();
      setState('blocked');
      setLabel('CALMAAA...');
      
      setTimeout(() => {
        if (elapsed >= UNLOCK_TIME) {
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
          <ProgressBar progress={(elapsed / TOTAL_TIME) * 100} isUnlocked={state === 'unlocked'} />
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