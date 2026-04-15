import React, { useRef, useEffect } from 'react';

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
    <div className="vsl-player">
      <video 
        ref={videoRef}
        id="vsl-video"
        src={`${videoUrl}#t=0.001`}
        playsInline 
        preload="auto"
      ></video>

      {!isPlaying && (
        <button className="vsl-playbtn" onClick={onPlay}>&#9654;</button>
      )}

      {isPlaying && (
        <div className="vsl-tap show" onClick={onPause}></div>
      )}

      <div className={`vsl-pause-ov ${!isPlaying && videoRef.current?.currentTime ? 'show' : ''}`} onClick={onPlay}>
        <div className="vsl-scare">
          <div className="vsl-scare-icon">🚨</div>
          <h2>CORRA PRA RESGATAR SEU CARRO VIP</h2>
          <button className="vsl-resume">CONTINUAR ASSISTINDO</button>
        </div>
      </div>
    </div>
  );
};
