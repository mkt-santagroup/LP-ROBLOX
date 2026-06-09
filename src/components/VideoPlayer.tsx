import React, { useEffect, useState } from 'react';
import styles from './VideoPlayer.module.css';

interface VideoPlayerProps {
  videoUrl: string;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

// Frame do próprio vídeo usado como "thumb" (início do vídeo, ~primeiro segundo)
const POSTER_TIME = 0.1;

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  isPlaying,
  onPlay,
  onPause,
  videoRef
}) => {
  const [hasStarted, setHasStarted] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);

  // O fragmento #t faz o navegador (incluindo iOS) renderizar esse frame do
  // próprio vídeo como poster, no lugar de uma imagem fixa.
  const videoSrc = videoUrl
    ? `${videoUrl}${videoUrl.includes('#') ? '' : `#t=${POSTER_TIME}`}`
    : videoUrl;

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

  // Garante que o primeiro frame apareça assim que o vídeo carrega (fallback p/ desktop)
  const handleLoadedData = () => {
    const video = videoRef.current;
    if (video && !hasStarted && video.currentTime === 0) {
      try { video.currentTime = POSTER_TIME; } catch { /* noop */ }
    }
  };

  const handleEnded = () => {
    setHasEnded(true);
    onPause();
    // Volta pro frame inicial pra "thumb" do replay ser o começo do vídeo
    const video = videoRef.current;
    if (video) {
      try { video.currentTime = POSTER_TIME; } catch { /* noop */ }
    }
  };

  return (
    <div className={styles.player}>
      <video
        ref={videoRef}
        id="vsl-video"
        src={videoSrc}
        playsInline
        preload="metadata"
        className={styles.video}
        onLoadedData={handleLoadedData}
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

      {/* Replay: o próprio vídeo mostra o frame inicial; só o texto por cima */}
      {hasEnded && (
        <div className={styles.thumbnailOverlay} onClick={onPlay}>
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
          <h2>QUASE LÁ! ASSISTE ATÉ O FIM</h2>
          <button className={styles.resume}>CONTINUAR ASSISTINDO</button>
        </div>
      </div>
    </div>
  );
};