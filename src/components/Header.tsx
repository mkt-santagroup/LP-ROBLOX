import React from 'react';
import styles from './Header.module.css';

interface HeaderProps {
  logoUrl: string;
}

export const Header: React.FC<HeaderProps> = ({ logoUrl }) => (
  <div className={styles.header}>
    <img src="/logo.png" alt="Brazilian Life RP" className={styles.logo} />
  </div>
);
