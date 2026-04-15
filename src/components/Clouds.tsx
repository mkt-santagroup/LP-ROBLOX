import React from 'react';
import styles from './Clouds.module.css';

export const Clouds: React.FC = () => (
  <div className={styles.clouds}>
    <div className={`${styles.cloud} ${styles.c1}`}></div>
    <div className={`${styles.cloud} ${styles.c2}`}></div>
    <div className={`${styles.cloud} ${styles.c3}`}></div>
    <div className={`${styles.cloud} ${styles.c4}`}></div>
  </div>
);
