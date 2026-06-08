import React, { useState, useRef, useEffect } from 'react';
import { Users2, ChevronDown, Check, Search } from 'lucide-react';
import styles from './InfluencerPicker.module.css';

interface Option {
  value: string;
  label: string;
  slug?: string;
}

interface Props {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}

export default function InfluencerPicker({ value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const allOptions: Option[] = [{ value: 'all', label: 'Todos os influenciadores' }, ...options];
  const selected = allOptions.find(o => o.value === value) || allOptions[0];

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()) || (o.slug || '').includes(query.toLowerCase()))
    : options;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen(!open)} type="button">
        <span className={styles.triggerLeft}>
          <Users2 size={16} color="#a855f7" />
          <span className={styles.triggerLabel}>{selected.label}</span>
        </span>
        <ChevronDown size={16} color="#8b8b93" className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} />
      </button>

      {open && (
        <div className={styles.popover}>
          {options.length > 5 && (
            <div className={styles.searchBox}>
              <Search size={14} color="#8b8b93" />
              <input
                autoFocus
                placeholder="Buscar influenciador..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}

          <div className={styles.list}>
            <button
              type="button"
              className={`${styles.item} ${value === 'all' ? styles.itemActive : ''}`}
              onClick={() => pick('all')}
            >
              <span className={styles.itemDot} style={{ background: '#8b8b93' }} />
              <span className={styles.itemLabel}>Todos os influenciadores</span>
              {value === 'all' && <Check size={15} color="#a855f7" />}
            </button>

            {filtered.length === 0 && (
              <div className={styles.empty}>Nenhum encontrado</div>
            )}

            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`${styles.item} ${value === o.value ? styles.itemActive : ''}`}
                onClick={() => pick(o.value)}
              >
                <span className={styles.itemAvatar}>{o.label.charAt(0).toUpperCase()}</span>
                <span className={styles.itemLabel}>
                  {o.label}
                  {o.slug && <span className={styles.itemSlug}>/{o.slug}</span>}
                </span>
                {value === o.value && <Check size={15} color="#a855f7" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
