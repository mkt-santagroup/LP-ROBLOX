import React, { useEffect, useState } from 'react';
import styles from './VideoPlayer.module.css';

interface VideoPlayerProps {
  videoUrl: string;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

const thumbnailUrl = 'https://nfctydisrnpofyscngrx.supabase.co/storage/v1/object/public/videos-tutoriais/thumb.png';

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  videoUrl, 
  isPlaying, 
  onPlay, 
  onPause, 
  videoRef 
}) => {
  const [hasStarted, setHasStarted] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (isPlaying) {
      setHasStarted(true);
      setHasEnded(false);
    }
    
    if (video) {
      if (isPlaying) {
        if (hasEnded) {
          video.currentTime = 0;
        }
        video.play().catch((err) => console.warn("Erro ao dar play:", err));
      } else {
        video.pause();
      }
    }
  }, [isPlaying, hasEnded, videoRef]);

  const handleEnded = () => {
    setHasEnded(true);
    onPause();
  };

  return (
    <div className={styles.player}>
      <video 
        ref={videoRef}
        id="vsl-video"
        src={videoUrl}
        poster={thumbnailUrl}
        playsInline 
        preload="metadata" 
        className={styles.video}
        onEnded={handleEnded}
      ></video>

      {/* Botão de Play Inicial Seguro e Personalizado */}
      {!hasStarted && (
        <button className={styles.playButtonContainer} onClick={onPlay}>
          <div className={styles.playButton}>
             <svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </button>
      )}

      {hasEnded && (
        <div className={styles.thumbnailOverlay} onClick={onPlay}>
          <img src={thumbnailUrl} alt="Thumbnail do vídeo" className={styles.thumbnailImage} />
          <div className={styles.replayText}>VER DE NOVO</div>
        </div>
      )}

      {/* Overlay de Pausa (Scare) */}
      {isPlaying && (
        <div className={`${styles.tap} ${styles.show}`} onClick={onPause}></div>
      )}

      <div 
        className={`${styles.pauseOv} ${!isPlaying && hasStarted && !hasEnded ? styles.show : ''}`} 
        onClick={onPlay}
      >
        <div className={styles.scare}>
          <div className={styles.scareIcon}>🚨</div>
          <h2>CORRA PRA RESGATAR SEU CARRO VIP</h2>
          <button className={styles.resume}>CONTINUAR ASSISTINDO</button>
        </div>
      </div>
    </div>
  );
};