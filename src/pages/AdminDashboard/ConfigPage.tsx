import React, { useEffect, useState, useCallback } from 'react';
import {
  Link2, Save, Check, AlertTriangle, Megaphone, Timer, Database,
  RefreshCw, ShieldAlert, Eye, EyeOff, ExternalLink,
} from 'lucide-react';
import {
  fetchAppConfig, saveAppConfig, getMetaCredentials, saveMetaCredentials,
  clampDelay, isValidUrl, MIN_REDIRECT_DELAY_MS, MAX_REDIRECT_DELAY_MS,
} from '../../lib/appConfig';
import { checkSupabaseHealth, SupabaseHealth, supabaseConfig } from '../../lib/supabase';
import styles from './ConfigPage.module.css';

const SOURCE_LABEL: Record<string, string> = {
  banco: 'salvo aqui no painel',
  env: 'vindo do arquivo .env',
  padrão: 'padrão embutido no código',
  nenhum: 'não configurado',
};

export default function ConfigPage() {
  // ---- Status da conexão ----
  const [health, setHealth] = useState<SupabaseHealth | null>(null);
  const [checking, setChecking] = useState(true);

  const runHealthCheck = useCallback(async () => {
    setChecking(true);
    setHealth(await checkSupabaseHealth());
    setChecking(false);
  }, []);

  // ---- Redirecionamento ----
  const [redirectUrl, setRedirectUrl] = useState('');
  const [delaySec, setDelaySec] = useState('4');
  const [redirectSource, setRedirectSource] = useState('padrão');
  const [savingRedirect, setSavingRedirect] = useState(false);
  const [redirectMsg, setRedirectMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ---- Meta Ads ----
  const [metaToken, setMetaToken] = useState('');
  const [metaAccount, setMetaAccount] = useState('');
  const [metaPrefixo, setMetaPrefixo] = useState('');
  const [metaSource, setMetaSource] = useState('nenhum');
  const [showToken, setShowToken] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaMsg, setMetaMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [cfg, meta] = await Promise.all([fetchAppConfig(), getMetaCredentials()]);

    setRedirectUrl(cfg.redirectUrl);
    setDelaySec(String(Math.round(cfg.redirectDelayMs / 1000)));
    setRedirectSource(cfg.source);

    setMetaToken(meta.token);
    setMetaAccount(meta.adAccount);
    setMetaPrefixo(meta.prefixo);
    setMetaSource(meta.source);

    setLoading(false);
  }, []);

  useEffect(() => { runHealthCheck(); loadAll(); }, [runHealthCheck, loadAll]);

  const handleSaveRedirect = async (e: React.FormEvent) => {
    e.preventDefault();
    setRedirectMsg(null);
    if (!isValidUrl(redirectUrl)) {
      setRedirectMsg({ ok: false, text: 'O link precisa começar com http:// ou https://' });
      return;
    }
    setSavingRedirect(true);
    const ms = clampDelay(Number(delaySec) * 1000);
    const { error } = await saveAppConfig({ redirectUrl: redirectUrl.trim(), redirectDelayMs: ms });
    setSavingRedirect(false);
    if (error) { setRedirectMsg({ ok: false, text: error }); return; }
    setDelaySec(String(Math.round(ms / 1000)));
    setRedirectSource('banco');
    setRedirectMsg({ ok: true, text: 'Salvo! A LP já está usando esse link — não precisa de deploy.' });
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    setMetaMsg(null);
    setSavingMeta(true);
    const { error } = await saveMetaCredentials({ token: metaToken, adAccount: metaAccount, prefixo: metaPrefixo });
    setSavingMeta(false);
    if (error) { setMetaMsg({ ok: false, text: error }); return; }
    const fresh = await getMetaCredentials();
    setMetaAccount(fresh.adAccount);
    setMetaSource(fresh.source);
    setMetaMsg({ ok: true, text: 'Credenciais salvas! Abra a aba Anúncios pra ver os dados.' });
  };

  const delayNum = Number(delaySec);
  const delayWarn = Number.isFinite(delayNum) && (delayNum * 1000 < MIN_REDIRECT_DELAY_MS || delayNum * 1000 > MAX_REDIRECT_DELAY_MS);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Configurações</h1>
          <p>Link de redirecionamento, tempo de espera e credenciais do Meta — tudo sem precisar de deploy.</p>
        </div>
      </header>

      {/* ================= STATUS DO BANCO ================= */}
      <h2 className={styles.sectionHeader}>CONEXÃO COM O BANCO</h2>
      <div className={`${styles.card} ${health && !health.ok ? styles.cardDanger : ''}`}>
        {checking ? (
          <div className={styles.statusRow}>
            <RefreshCw size={20} className={styles.spin} color="#8b8b93" />
            <div><strong>Testando a conexão…</strong></div>
          </div>
        ) : health?.ok ? (
          <div className={styles.statusRow}>
            <span className={styles.dotOk} />
            <div>
              <strong className={styles.okText}>Conectado ao Supabase</strong>
              <p className={styles.statusDetail}>{health.detail}</p>
            </div>
            <button className={styles.ghostBtn} onClick={runHealthCheck}><RefreshCw size={15} /> Testar de novo</button>
          </div>
        ) : (
          <div className={styles.statusFail}>
            <div className={styles.statusRow}>
              <AlertTriangle size={22} color="#ef4444" />
              <div>
                <strong className={styles.failText}>{health?.title}</strong>
                <p className={styles.statusDetail}>{health?.detail}</p>
              </div>
              <button className={styles.ghostBtn} onClick={runHealthCheck}><RefreshCw size={15} /> Testar de novo</button>
            </div>
            <div className={styles.hintBox}>
              <strong>Como resolver:</strong>
              <p>{health?.hint}</p>
              {supabaseConfig.projectRef && (
                <p className={styles.refLine}>
                  Projeto configurado agora: <code>{supabaseConfig.projectRef}</code>
                </p>
              )}
              <a className={styles.hintLink} href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
                Abrir o painel do Supabase <ExternalLink size={13} />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ================= REDIRECIONAMENTO ================= */}
      <h2 className={styles.sectionHeader}>REDIRECIONAMENTO DA LP</h2>
      <form className={styles.card} onSubmit={handleSaveRedirect}>
        <div className={styles.sourceChip}>
          Link em uso: <strong>{SOURCE_LABEL[redirectSource]}</strong>
        </div>

        <div className={styles.rowSplit}>
          <div className={styles.field}>
            <label htmlFor="redirectUrl"><Link2 size={14} /> Link de destino</label>
            <input
              id="redirectUrl"
              type="url"
              inputMode="url"
              placeholder="https://www.roblox.com/games/start?..."
              value={loading ? '' : redirectUrl}
              onChange={(e) => { setRedirectUrl(e.target.value); setRedirectMsg(null); }}
            />
            <span className={styles.hint}>
              Pra onde a LP manda a pessoa. Vale pra <code>/</code> e pra todos os influencers que
              <strong> não </strong>têm link próprio cadastrado.
            </span>
          </div>

          <div className={styles.field}>
            <label htmlFor="delay"><Timer size={14} /> Tempo na tela de espera</label>
            <div className={styles.inlineField}>
              <input
                id="delay"
                type="number"
                min={MIN_REDIRECT_DELAY_MS / 1000}
                max={MAX_REDIRECT_DELAY_MS / 1000}
                step={1}
                value={loading ? '' : delaySec}
                onChange={(e) => { setDelaySec(e.target.value); setRedirectMsg(null); }}
              />
              <span className={styles.unit}>segundos</span>
            </div>
            <span className={styles.hint}>
              Quanto tempo a pessoa vê “Estamos redirecionando você pro jogo” antes de sair.
              Recomendado entre 3 e 5. {delayWarn && <strong className={styles.warnInline}>Valor será ajustado para o limite de {MIN_REDIRECT_DELAY_MS / 1000}–{MAX_REDIRECT_DELAY_MS / 1000}s.</strong>}
            </span>
          </div>
        </div>

        <div className={styles.priorityNote}>
          <strong>Ordem de prioridade do link:</strong>
          <ol>
            <li>Link próprio do influencer (aba <em>Influencers</em>)</li>
            <li>Este link aqui</li>
            <li><code>VITE_REDIRECT_URL</code> do arquivo <code>.env</code></li>
            <li>Link padrão embutido no código</li>
          </ol>
        </div>

        {redirectMsg && (
          <div className={redirectMsg.ok ? styles.okMsg : styles.errMsg}>
            {redirectMsg.ok ? <Check size={16} /> : <AlertTriangle size={16} />} {redirectMsg.text}
          </div>
        )}

        <button type="submit" className={styles.primaryBtn} disabled={savingRedirect || loading}>
          <Save size={17} /> {savingRedirect ? 'Salvando…' : 'Salvar redirecionamento'}
        </button>
      </form>

      {/* ================= META ADS ================= */}
      <h2 className={styles.sectionHeader}>META (FACEBOOK) ADS</h2>
      <form className={styles.card} onSubmit={handleSaveMeta}>
        <div className={styles.sourceChip}>
          Credenciais em uso: <strong>{SOURCE_LABEL[metaSource]}</strong>
        </div>

        <div className={styles.securityWarn}>
          <ShieldAlert size={20} color="#f59e0b" />
          <div>
            <strong>O token fica visível pra quem abrir o site.</strong>
            <p>
              O painel roda inteiro no navegador, então o token precisa chegar até ele pra
              consultar a Graph API — igual já acontecia pelo <code>.env</code>. Use um token com
              acesso só de leitura de anúncios (<code>ads_read</code>) e troque-o aqui se suspeitar
              de vazamento. Pra esconder de verdade seria preciso mover a chamada pra uma Edge Function.
            </p>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="metaToken"><Megaphone size={14} /> Token de acesso</label>
          <div className={styles.inlineField}>
            <input
              id="metaToken"
              name="meta-graph-token"
              type={showToken ? 'text' : 'password'}
              placeholder="EAA..."
              // O Chrome ignora autoComplete="off" em campos type=password e
              // injeta uma senha salva aqui. "new-password" + data-1p-ignore
              // impedem o autofill do navegador e dos gerenciadores de senha.
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              spellCheck={false}
              value={loading ? '' : metaToken}
              onChange={(e) => { setMetaToken(e.target.value); setMetaMsg(null); }}
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setShowToken(v => !v)}
              title={showToken ? 'Esconder' : 'Mostrar'}
              aria-label={showToken ? 'Esconder token' : 'Mostrar token'}
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <span className={styles.hint}>Gerado no Meta for Developers → Graph API Explorer (permissão <code>ads_read</code>).</span>
        </div>

        <div className={styles.rowHalf}>
          <div className={styles.field}>
            <label htmlFor="metaAccount">Conta de anúncios</label>
            <input
              id="metaAccount"
              type="text"
              inputMode="numeric"
              placeholder="act_1234567890"
              value={loading ? '' : metaAccount}
              onChange={(e) => { setMetaAccount(e.target.value); setMetaMsg(null); }}
            />
            <span className={styles.hint}>Pode colar só os números — o <code>act_</code> é adicionado sozinho.</span>
          </div>

          <div className={styles.field}>
            <label htmlFor="metaPrefixo">Tag das campanhas (opcional)</label>
            <input
              id="metaPrefixo"
              type="text"
              placeholder="[ROBLOX]"
              value={loading ? '' : metaPrefixo}
              onChange={(e) => { setMetaPrefixo(e.target.value); setMetaMsg(null); }}
            />
            <span className={styles.hint}>Só entram campanhas cujo nome contém essa tag (funciona com ou sem colchetes). Vazio = todas.</span>
          </div>
        </div>

        <div className={styles.priorityNote}>
          Deixe token e conta <strong>vazios</strong> pra voltar a usar o que está no <code>.env</code>.
        </div>

        {metaMsg && (
          <div className={metaMsg.ok ? styles.okMsg : styles.errMsg}>
            {metaMsg.ok ? <Check size={16} /> : <AlertTriangle size={16} />} {metaMsg.text}
          </div>
        )}

        <button type="submit" className={styles.primaryBtn} disabled={savingMeta || loading}>
          <Save size={17} /> {savingMeta ? 'Salvando…' : 'Salvar credenciais do Meta'}
        </button>
      </form>

      <div className={styles.footNote}>
        <Database size={14} /> Estas configurações ficam na tabela <code>lp_config</code> do Supabase.
        Se der erro ao salvar, rode a migration <code>supabase/migrations/20260731_create_lp_config.sql</code> no SQL Editor.
      </div>
    </div>
  );
}
