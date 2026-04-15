import React from 'react';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  progress: number;
  isUnlocked: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, isUnlocked }) => (
  <div className={styles.progressWrap} id="progress-wrap">
    <div className={styles.progressTrack}>
      <div 
        id="prog-fill"
        className={`${styles.progressFill} ${isUnlocked ? styles.unlocked : ''}`} 
        style={{ width: `${progress}%` }}
      ></div>
    </div>
  </div>
);
