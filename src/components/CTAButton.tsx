import React from 'react';
import styles from './CTAButton.module.css';

interface CTAButtonProps {
  state: 'initial' | 'watching' | 'blocked' | 'unlocked';
  onClick: () => void;
  label: string;
}

export const CTAButton: React.FC<CTAButtonProps> = ({ state, onClick, label }) => {
  const stateClass = styles[`state-${state}` as keyof typeof styles] || '';
  
  return (
    <div className={styles.ctaWrap}>
      <button 
        id="btn-cta" 
        onClick={onClick}
        className={`${styles.btnCta} ${stateClass}`}
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
          <path d="M8 5.14v14l11-7-11-7z" fill="#fff"/>
        </svg>
        <span>{label}</span>
      </button>
    </div>
  );
};
