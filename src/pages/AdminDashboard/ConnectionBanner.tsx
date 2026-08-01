import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, Settings } from 'lucide-react';
import { checkSupabaseHealth, SupabaseHealth } from '../../lib/supabase';
import styles from './ConnectionBanner.module.css';

//
// Faixa de alerta no topo do /admin quando o banco não responde.
//
// Existe porque o sintoma sem ela é o pior possível: os gráficos ficam zerados
// e a única pista é um ERR_NAME_NOT_RESOLVED escondido no console. Aqui o
// motivo aparece na tela, com o caminho pra resolver.
//
export default function ConnectionBanner() {
  const [health, setHealth] = useState<SupabaseHealth | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    let active = true;
    checkSupabaseHealth().then(h => { if (active) setHealth(h); });
    return () => { active = false; };
  }, []);

  // Na página de Configurações o diagnóstico completo já é exibido — não repete.
  if (!health || health.ok || pathname.startsWith('/admin/configuracoes')) return null;

  // A frase muda conforme a causa: antes era fixa em "não é a senha nem a chave",
  // o que virava mentira justamente no caso em que a chave ERA o problema.
  const RESUMO: Record<string, string> = {
    dns: 'Por isso o painel está sem dados — não é a senha nem a chave: o projeto não está respondendo.',
    auth: 'Por isso o painel está sem dados. Copie de novo a chave "anon public" no painel do Supabase.',
    table: 'A conexão está OK — falta rodar as migrations pra criar as tabelas.',
    config: 'Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env e reinicie o servidor.',
    unknown: 'Por isso o painel está sem dados.',
  };

  return (
    <div className={styles.banner} role="alert">
      <AlertTriangle size={20} className={styles.icon} />
      <div className={styles.text}>
        <strong>{health.title}.</strong>{' '}
        <span>{RESUMO[health.kind] ?? RESUMO.unknown}</span>
      </div>
      <Link to="/admin/configuracoes" className={styles.action}>
        <Settings size={15} /> Ver diagnóstico
      </Link>
    </div>
  );
}
