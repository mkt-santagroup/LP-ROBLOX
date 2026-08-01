import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Megaphone, DollarSign, MousePointerClick, Percent, Target,
  RefreshCw, AlertTriangle, Settings,
} from 'lucide-react';
import { fetchMetaAds, MetaAdsResponse, MetaCampanhaRow } from '../../lib/metaAds';
import styles from './AnunciosDashboard.module.css';

const PRESETS = [
  { dias: 1, label: 'Hoje' },
  { dias: 7, label: '7 dias' },
  { dias: 30, label: '30 dias' },
  { dias: 90, label: '90 dias' },
];

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (n: number) => n.toLocaleString('pt-BR');
const pct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

// "Resultado" no estilo Ads Manager: usa leads se houver, senão conversas.
function resultadoDe(r: MetaCampanhaRow) {
  if (r.leads > 0) return { val: r.leads, label: 'leads', custo: r.custoPorLead };
  if (r.conversas > 0) return { val: r.conversas, label: 'conversas', custo: r.custoPorConversa };
  return { val: 0, label: '—', custo: 0 };
}

function Kpi({ icon: Icon, color, title, value }: { icon: any; color: string; title: string; value: string }) {
  return (
    <div className={styles.kpi} style={{ borderColor: `${color}30` }}>
      <div className={styles.kpiIcon} style={{ background: `${color}22` }}><Icon size={20} color={color} /></div>
      <div>
        <div className={styles.kpiTitle}>{title}</div>
        <div className={styles.kpiValue}>{value}</div>
      </div>
    </div>
  );
}

export default function AnunciosDashboard() {
  const [dias, setDias] = useState(30);
  const [data, setData] = useState<MetaAdsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    const res = await fetchMetaAds({ dias: d });
    setData(res);
    setLoading(false);
  }, []);

  useEffect(() => { load(dias); }, [dias, load]);

  const rows = data?.rows ?? [];
  const tot = rows.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      clicks: a.clicks + r.linkClicks,
      impressions: a.impressions + r.impressions,
      leads: a.leads + r.leads,
      conversas: a.conversas + r.conversas,
    }),
    { spend: 0, clicks: 0, impressions: 0, leads: 0, conversas: 0 },
  );
  const ctrMedio = tot.impressions > 0 ? (tot.clicks / tot.impressions) * 100 : 0;
  const cpcMedio = tot.clicks > 0 ? tot.spend / tot.clicks : 0;
  const resultadosTot = tot.leads > 0 ? tot.leads : tot.conversas;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.titleRow}><Megaphone size={22} color="#a855f7" /><h1>Anúncios</h1></div>
          <p>
            Métricas dos anúncios do Meta (Facebook) por campanha.
            {data?.prefixo ? <> Filtro: <strong>{data.prefixo}</strong></> : null}
          </p>
        </div>
        <div className={styles.controls}>
          <div className={styles.presets}>
            {PRESETS.map((p) => (
              <button
                key={p.dias}
                className={`${styles.chip} ${dias === p.dias ? styles.chipOn : ''}`}
                onClick={() => setDias(p.dias)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className={styles.refresh} onClick={() => load(dias)} disabled={loading} title="Atualizar">
            <RefreshCw size={16} className={loading ? styles.spin : ''} />
          </button>
        </div>
      </header>

      {loading && !data ? (
        <div className={styles.empty}>Carregando anúncios…</div>
      ) : data && !data.configurado ? (
        <div className={styles.notice}>
          <Settings size={22} color="#f59e0b" />
          <div>
            <strong>Integração do Meta ainda não configurada.</strong>
            <p>
              Preencha o <strong>token</strong> e a <strong>conta de anúncios</strong> em{' '}
              <Link to="/admin/configuracoes" className={styles.noticeLink}>Configurações</Link>{' '}
              — vale na hora, sem deploy. (Também dá pra deixar em{' '}
              <code>VITE_META_TOKEN</code> e <code>VITE_META_AD_ACCOUNT</code> no <code>.env</code>.)
            </p>
          </div>
        </div>
      ) : data?.erro ? (
        <div className={styles.error}><AlertTriangle size={18} /> {data.erro}</div>
      ) : (
        <>
          <div className={styles.kpis}>
            <Kpi icon={DollarSign} color="#22c55e" title="Investido" value={brl(tot.spend)} />
            <Kpi icon={MousePointerClick} color="#a855f7" title="Cliques no link" value={num(tot.clicks)} />
            <Kpi icon={Percent} color="#f59e0b" title="CTR médio" value={pct(ctrMedio)} />
            <Kpi icon={DollarSign} color="#38bdf8" title="CPC médio" value={brl(cpcMedio)} />
            <Kpi icon={Target} color="#ec4899" title="Resultados" value={num(resultadosTot)} />
          </div>

          {rows.length === 0 ? (
            <div className={styles.empty}>
              Nenhuma campanha encontrada no período{data?.prefixo ? ` com o prefixo "${data.prefixo}"` : ''}.
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th>Status</th>
                    <th className={styles.num}>Investido</th>
                    <th className={styles.num}>Impressões</th>
                    <th className={styles.num}>Cliques</th>
                    <th className={styles.num}>CTR</th>
                    <th className={styles.num}>CPC</th>
                    <th className={styles.num}>CPM</th>
                    <th className={styles.num}>Resultados</th>
                    <th className={styles.num}>Custo/result.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const rz = resultadoDe(r);
                    return (
                      <tr key={r.campanhaId}>
                        <td className={styles.nameCell} title={r.nomeCompleto}>{r.nome}</td>
                        <td>
                          <span className={`${styles.status} ${r.ativa ? styles.stActive : styles.stPaused}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className={styles.num}>{brl(r.spend)}</td>
                        <td className={styles.num}>{num(r.impressions)}</td>
                        <td className={styles.num}>{num(r.linkClicks)}</td>
                        <td className={styles.num}>{pct(r.ctr)}</td>
                        <td className={styles.num}>{brl(r.cpc)}</td>
                        <td className={styles.num}>{brl(r.cpm)}</td>
                        <td className={styles.num}>{rz.val > 0 ? `${num(rz.val)} ${rz.label}` : '—'}</td>
                        <td className={styles.num}>{rz.val > 0 ? brl(rz.custo) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data && (
            <div className={styles.footNote}>
              Período: {data.since} → {data.until}
            </div>
          )}
        </>
      )}
    </div>
  );
}
