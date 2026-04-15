import React, { useRef, useEffect } from 'react';
import styles from './VideoPlayer.module.css';

interface VideoPlayerProps {
  videoUrl: string;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl, isPlaying, onPlay, onPause }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying]);

  return (
    <div className={styles.player}>
      <video 
        ref={videoRef}
        id="vsl-video"
        src={`${videoUrl}#t=0.001`}
        playsInline 
        preload="auto"
        className={styles.video}
      ></video>

      {!isPlaying && (
        <button className={styles.playbtn} onClick={onPlay}>&#9654;</button>
      )}

      {isPlaying && (
        <div className={`${styles.tap} ${styles.show}`} onClick={onPause}></div>
      )}

      <div className={`${styles.pauseOv} ${!isPlaying && videoRef.current?.currentTime ? styles.show : ''}`} onClick={onPlay}>
        <div className={styles.scare}>
          <div className={styles.scareIcon}>🚨</div>
          <h2>CORRA PRA RESGATAR SEU CARRO VIP</h2>
          <button className={styles.resume}>CONTINUAR ASSISTINDO</button>
        </div>
      </div>
    </div>
  );
};
