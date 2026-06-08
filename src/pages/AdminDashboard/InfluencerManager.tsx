import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import styles from './InfluencerManager.module.css';
import {
  Influencer, listInfluencers, addInfluencer, updateInfluencer, deleteInfluencer, slugify
} from '../../lib/influencers';
import { UserPlus, Link2, Trash2, Pencil, Check, X, BarChart2, Copy, ExternalLink } from 'lucide-react';

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';

export default function InfluencerManager() {
  const [list, setList] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);

  // Form de novo influenciador
  const [name, setName] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edição inline
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editVideo, setEditVideo] = useState('');

  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setList(await listInfluencers());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const previewSlug = slugify(name);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Coloque o nome do influenciador.'); return; }
    setSaving(true);
    const { error } = await addInfluencer(name, videoUrl);
    setSaving(false);
    if (error) { setError(error); return; }
    setName(''); setVideoUrl('');
    load();
  };

  const startEdit = (inf: Influencer) => {
    setEditId(inf.id);
    setEditName(inf.name);
    setEditVideo(inf.video_url || '');
  };

  const saveEdit = async (id: string) => {
    const { error } = await updateInfluencer(id, editName, editVideo);
    if (error) { setError(error); return; }
    setEditId(null);
    load();
  };

  const handleDelete = async (inf: Influencer) => {
    if (!window.confirm(`Remover o influenciador "${inf.name}" (/${inf.slug})?`)) return;
    await deleteInfluencer(inf.id);
    load();
  };

  const copyLink = (slug: string) => {
    const url = `${ORIGIN}/${slug}`;
    navigator.clipboard?.writeText(url);
    setCopied(slug);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Influenciadores</h1>
          <p>Cadastre influenciadores, defina o vídeo de cada um e gere o link de divulgação.</p>
        </div>
        <Link to="/admin" className={styles.backBtn}>
          <BarChart2 size={16} /> Ver Métricas
        </Link>
      </header>

      {/* FORM */}
      <h2 className={styles.sectionHeader}>NOVO INFLUENCIADOR</h2>
      <form className={styles.formCard} onSubmit={handleAdd}>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label>Nome do influenciador</label>
            <input
              type="text"
              placeholder="Ex: Nathan"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {name.trim() && (
              <span className={styles.slugPreview}>
                <Link2 size={13} /> Link gerado: <strong>{ORIGIN}/{previewSlug || '...'}</strong>
              </span>
            )}
          </div>
          <div className={styles.field}>
            <label>URL do vídeo (opcional)</label>
            <input
              type="text"
              placeholder="https://.../video.mp4"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
            <span className={styles.hint}>Se vazio, usa o vídeo padrão da LP.</span>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button type="submit" className={styles.addBtn} disabled={saving}>
          <UserPlus size={18} /> {saving ? 'Salvando...' : 'Adicionar Influenciador'}
        </button>
      </form>

      {/* LISTA */}
      <h2 className={styles.sectionHeader}>
        CADASTRADOS {list.length > 0 && <span className={styles.count}>{list.length}</span>}
      </h2>

      {loading ? (
        <div className={styles.empty}>Carregando...</div>
      ) : list.length === 0 ? (
        <div className={styles.empty}>
          Nenhum influenciador cadastrado ainda. Adicione o primeiro acima 👆
        </div>
      ) : (
        <div className={styles.list}>
          {list.map((inf) => (
            <div key={inf.id} className={styles.row}>
              {editId === inf.id ? (
                <div className={styles.editArea}>
                  <input className={styles.editInput} value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nome" />
                  <input className={styles.editInput} value={editVideo} onChange={(e) => setEditVideo(e.target.value)} placeholder="URL do vídeo" />
                  <button className={styles.iconBtnOk} onClick={() => saveEdit(inf.id)} title="Salvar"><Check size={16} /></button>
                  <button className={styles.iconBtn} onClick={() => setEditId(null)} title="Cancelar"><X size={16} /></button>
                </div>
              ) : (
                <>
                  <div className={styles.avatar}>{inf.name.charAt(0).toUpperCase()}</div>
                  <div className={styles.rowInfo}>
                    <div className={styles.rowName}>{inf.name}</div>
                    <div className={styles.rowMeta}>
                      <span className={styles.slugChip}>/{inf.slug}</span>
                      {inf.video_url
                        ? <span className={styles.videoOk}>🎬 vídeo próprio</span>
                        : <span className={styles.videoDefault}>vídeo padrão</span>}
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    <button className={styles.linkBtn} onClick={() => copyLink(inf.slug)}>
                      {copied === inf.slug ? <><Check size={14} /> Copiado!</> : <><Copy size={14} /> Copiar link</>}
                    </button>
                    <a className={styles.iconBtn} href={`/${inf.slug}`} target="_blank" rel="noreferrer" title="Abrir LP"><ExternalLink size={16} /></a>
                    <button className={styles.iconBtn} onClick={() => startEdit(inf)} title="Editar"><Pencil size={16} /></button>
                    <button className={styles.iconBtnDanger} onClick={() => handleDelete(inf)} title="Remover"><Trash2 size={16} /></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
