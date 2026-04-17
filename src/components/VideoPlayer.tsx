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
        src={videoUrl} /* <-- REMOVIDO o #t=0.001, agora o poster vai brilhar! */
        poster="/thumb.png"
        playsInline 
        preload="auto"
        className={styles.video}
      ></video>

      {/* Botão de Play Inicial Seguro */}
      {!hasStarted && (
        <button className={styles.playbtn} onClick={onPlay}>&#9654;</button>
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