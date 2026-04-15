import React from 'react';

interface ProgressBarProps {
  progress: number;
  isUnlocked: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, isUnlocked }) => (
  <div className="vsl-progress-wrap" id="progress-wrap">
    <div className="vsl-progress-track">
      <div 
        id="prog-fill"
        className={`vsl-progress-fill ${isUnlocked ? 'unlocked' : ''}`} 
        style={{ width: `${progress}%` }}
      ></div>
    </div>
  </div>
);
