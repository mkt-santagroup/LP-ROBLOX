import React, { useEffect, useState } from 'react';
import styles from './VideoPlayer.module.css';

interface VideoPlayerProps {
  videoUrl: string;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  videoUrl, 
  isPlaying, 
  onPlay, 
  onPause, 
  videoRef 
}) => {
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (isPlaying) {
      setHasStarted(true);
    }
    
    if (video) {
      if (isPlaying) {
        video.play().catch((err) => console.warn("Erro ao dar play:", err));
      } else {
        video.pause();
      }
    }
  }, [isPlaying, videoRef]);

  return (
    <div className={styles.player}>
      <video 
        ref={videoRef}
        id="vsl-video"
        src={videoUrl}
        poster="/thumb.png"
        playsInline 
        preload="metadata" /* <--- OTIMIZAÇÃO: Não baixa o vídeo inteiro à toa */
        className={styles.video}
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

      {/* Overlay de Pausa (Scare) */}
      {isPlaying && (
        <div className={`${styles.tap} ${styles.show}`} onClick={onPause}></div>
      )}

      <div 
        className={`${styles.pauseOv} ${!isPlaying && hasStarted ? styles.show : ''}`} 
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