import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import styles from './AdminGate.module.css';

const STORAGE_KEY = 'lp_admin_authed';
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || '';

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [pass, setPass] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pass === ADMIN_PASSWORD && ADMIN_PASSWORD !== '') {
      localStorage.setItem(STORAGE_KEY, 'true');
      setAuthed(true);
    } else {
      setError(true);
      setPass('');
    }
  };

  if (authed) return <>{children}</>;

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.iconCircle}>
          <Lock size={26} color="#a855f7" />
        </div>
        <h1>Área Restrita</h1>
        <p>Digite a senha para acessar o painel de métricas.</p>

        <input
          type="password"
          placeholder="Senha"
          value={pass}
          autoFocus
          onChange={(e) => { setPass(e.target.value); setError(false); }}
          className={error ? styles.inputError : ''}
        />

        {error && <span className={styles.errorMsg}>Senha incorreta. Tente novamente.</span>}

        <button type="submit">Entrar</button>
      </form>
    </div>
  );
}
