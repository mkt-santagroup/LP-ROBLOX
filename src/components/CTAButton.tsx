import React from 'react';
import styles from './CTAButton.module.css';

interface CTAButtonProps {
  state: 'initial' | 'watching' | 'blocked' | 'unlocked';
  onClick: () => void;
  label: string;
}

// Token ESTÁVEL por estado (não-hasheado) pro GTM puxar via "Click Classes".
// unlocked -> state_unlock (nome que o Wadson pediu) = momento da CONVERSÃO.
const STATE_TOKEN: Record<CTAButtonProps['state'], string> = {
  initial: 'initial',
  watching: 'watching',
  blocked: 'blocked',
  unlocked: 'unlock',
};

export const CTAButton: React.FC<CTAButtonProps> = ({ state, onClick, label }) => {
  const stateClass = styles[`state-${state}` as keyof typeof styles] || '';
  const token = STATE_TOKEN[state];

  return (
    <div className={styles.ctaWrap}>
      <button
        id="btn-cta"
        onClick={onClick}
        data-cta-state={token}
        // classes estáveis pro GTM: "cta-btn" (sempre) + "state_<estado>" (muda com o estado)
        className={`${styles.btnCta} ${stateClass} cta-btn state_${token}`}
      >
        {/* pointer-events:none garante que o clique caia SEMPRE no <button>
            (e não no svg/span), pro GTM ler as classes do botão de forma confiável */}
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24" style={{ pointerEvents: 'none' }}>
          <path d="M8 5.14v14l11-7-11-7z" fill="#fff"/>
        </svg>
        <span style={{ pointerEvents: 'none' }}>{label}</span>
      </button>
    </div>
  );
};
