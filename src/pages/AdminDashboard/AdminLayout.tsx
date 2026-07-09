import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BarChart2, Users2, Megaphone, Menu, X } from 'lucide-react';
import styles from './AdminLayout.module.css';

// Itens da navbar. `end` no Dashboard pra não ficar ativo nas subrotas.
const NAV = [
  { to: '/admin', label: 'Dashboard', icon: BarChart2, end: true },
  { to: '/admin/influenciadores', label: 'Influencers', icon: Users2, end: false },
  { to: '/admin/anuncios', label: 'Anúncios', icon: Megaphone, end: false },
];

export default function AdminLayout() {
  // Só o drawer mobile precisa de estado. No desktop, o expandir/recolher é
  // 100% CSS via :hover (a barra expande ao passar o mouse e recolhe ao tirar).
  const [mobileOpen, setMobileOpen] = useState(false);

  const shellClass = `${styles.shell} ${mobileOpen ? styles.mobileOpen : ''}`;

  return (
    <div className={shellClass}>
      {/* Hamburguer flutuante (só mobile) */}
      <button className={styles.hamburger} onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
        <Menu size={20} />
      </button>

      {/* Backdrop do overlay mobile */}
      <div className={styles.backdrop} onClick={() => setMobileOpen(false)} />

      {/* Sidebar: recolhida (ícones) por padrão, expande no hover sobrepondo o conteúdo */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>SG</div>
          <span className={styles.brandName}>SantaGroup</span>
          <button className={styles.mobileClose} onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>

        <nav className={styles.nav}>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
            >
              <span className={styles.itemIcon}><Icon size={20} strokeWidth={1.9} /></span>
              <span className={styles.itemLabel}>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
