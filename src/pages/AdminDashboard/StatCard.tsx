import React from 'react';
import styles from './AdminDashboard.module.css';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color }) => (
  <div className={styles.statCard} style={{ borderLeft: `4px solid ${color}` }}>
    <div className={styles.statIcon}>{icon}</div>
    <div className={styles.statInfo}>
      <h3>{title}</h3>
      <p>{value}</p>
    </div>
  </div>
);