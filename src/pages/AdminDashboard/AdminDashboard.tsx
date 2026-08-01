import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { listInfluencers, Influencer } from '../../lib/influencers';
import { fetchMetaSpendPorDia } from '../../lib/metaAds';
import styles from './AdminDashboard.module.css';
import CustomDatePicker from './CustomDatePicker';
import InfluencerPicker from './InfluencerPicker';
import { Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Bar, Line, Legend } from 'recharts';
import {
  Users, Eye, PlayCircle, AlertTriangle, MousePointerClick, ExternalLink, Zap, Split,
  Target, Smartphone, Monitor, Tablet, Trophy, Filter, Users2, Link2, TrendingUp, Ticket,
  Info, DollarSign
} from 'lucide-react';

const KpiCard = ({ title, value, subtitle, icon: Icon, color = "#a855f7", highlight = false }: any) => (
  <div
    className={styles.kpiCard}
    style={{
      background: `linear-gradient(145deg, ${color}${highlight ? '24' : '14'} 0%, #14141a 62%)`,
      borderColor: `${color}${highlight ? '66' : '30'}`,
    }}
  >
    <div className={styles.kpiAccent} style={{ background: color }} />
    <div className={styles.kpiTop}>
      <div>
        <div className={styles.kpiTitle}>{title}</div>
        <div className={styles.kpiValue} style={{ color: highlight ? color : '#fff' }}>{value}</div>
      </div>
      <div className={styles.kpiIcon} style={{ backgroundColor: `${color}22` }}>
        <Icon size={24} color={color} />
      </div>
    </div>
    {subtitle && <div className={styles.kpiCompare}>{subtitle}</div>}
  </div>
);

// Formata R$ (BRL)
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Dia no fuso de São Paulo ('YYYY-MM-DD') — mesmo fuso do date_start do Meta, pra o gasto
// bater com os acessos/conversões do mesmo dia, independente do fuso do navegador.
const diaSP = (d: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);

// Linha de status do gasto (Meta) — o gasto e os custos POR DIA aparecem no balão do gráfico.
const spendNoteStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
  fontSize: 12.5, color: '#8b8b93', margin: '10px 0 2px',
};

// Cores de cada dispositivo no donut
const DEVICE_META: Record<string, { label: string; color: string; icon: any }> = {
  desktop: { label: 'Desktop', color: '#a855f7', icon: Monitor },
  mobile: { label: 'Mobile', color: '#7c3aed', icon: Smartphone },
  tablet: { label: 'Tablet', color: '#c084fc', icon: Tablet },
  outros: { label: 'Outros', color: '#6b7280', icon: Eye },
};

// Cor (da marca) de cada rede social no ranking de influenciadores
const SOCIAL_COLOR: Record<string, string> = {
  instagram: '#e1306c', tiktok: '#25f4ee', youtube: '#ff0000', facebook: '#1877f2',
  twitter: '#1da1f2', x: '#1da1f2', kwai: '#ff7a00', whatsapp: '#25d366',
  telegram: '#0088cc', twitch: '#9146ff', discord: '#5865f2', direto: '#8b8b93',
};
const socialLabel = (name: string) =>
  name === 'direto' ? 'Direto (sem rede)' : name.charAt(0).toUpperCase() + name.slice(1);

// Tooltip custom do gráfico de conversão: acessos + conversões (LP) + codiguins (Roblox) do dia
function ConversionTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload || {};
  const codes = Object.entries(row.codes || {}).sort((a: any, b: any) => b[1] - a[1]);
  return (
    <div className={styles.convTooltip}>
      <div className={styles.convTooltipDay}>{label}</div>
      {row.gastoAtivo ? (
        // Grid de 3 colunas (métrica | contagem | custo) com divisor vertical contínuo e header "custos".
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', columnGap: 12 }}>
          <span />
          <span />
          <span style={{ borderLeft: '1px solid #3a3a45', paddingLeft: 12, paddingBottom: 5, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: '#8b8b93', textAlign: 'right' }}>custos</span>

          <span style={{ paddingTop: 5 }}>Acessos</span>
          <b style={{ paddingTop: 5, textAlign: 'right' }}>{row.acessos ?? 0}</b>
          <b style={{ paddingTop: 5, paddingLeft: 12, borderLeft: '1px solid #3a3a45', textAlign: 'right', color: '#c084fc' }}>{brl(row.custoAcesso ?? 0)}</b>

          <span style={{ paddingTop: 5, color: '#22c55e' }}>Redirecionados</span>
          <b style={{ paddingTop: 5, textAlign: 'right', color: '#22c55e' }}>{row.conversoes ?? 0}</b>
          <b style={{ paddingTop: 5, paddingLeft: 12, borderLeft: '1px solid #3a3a45', textAlign: 'right', color: '#00e5ff' }}>{brl(row.custoConversao ?? 0)}</b>

          <span style={{ paddingTop: 5, color: '#f59e0b' }}>Resgates (Roblox)</span>
          <b style={{ paddingTop: 5, textAlign: 'right', color: '#f59e0b' }}>{row.resgates ?? 0}</b>
          <b style={{ paddingTop: 5, paddingLeft: 12, borderLeft: '1px solid #3a3a45', textAlign: 'right', color: '#f59e0b' }}>{brl(row.custoResgate ?? 0)}</b>
        </div>
      ) : (
        <>
          <div className={styles.convTooltipRow}><span>Acessos</span><b>{row.acessos ?? 0}</b></div>
          <div className={styles.convTooltipRow} style={{ color: '#22c55e' }}><span>Redirecionados</span><b>{row.conversoes ?? 0}</b></div>
          <div className={styles.convTooltipRow} style={{ color: '#f59e0b' }}><span>Resgates (Roblox)</span><b>{row.resgates ?? 0}</b></div>
        </>
      )}
      {(row.manual ?? 0) > 0 && (
        <div className={styles.convTooltipCodes}>
          <div className={styles.convTooltipRow} style={{ color: '#fbbf24' }}>
            <span>↳ por clique manual</span><b>{row.manual}</b>
          </div>
        </div>
      )}
      {row.gastoAtivo && (
        <div className={styles.convTooltipCodes}>
          <div className={styles.convTooltipRow} style={{ color: '#22c55e' }}><span>Gasto no dia</span><b>{brl(row.gasto ?? 0)}</b></div>
        </div>
      )}
      {codes.length > 0 && (
        <div className={styles.convTooltipCodes}>
          {codes.map(([c, n]: any) => (
            <div key={c} className={styles.convTooltipCodeRow}><span>🎟️ {c}</span><b>{n}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [allData, setAllData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Resgates de cupom no Roblox (espelhados da API via Edge Function), filtrados pelo período
  const [couponUsages, setCouponUsages] = useState<any[]>([]);
  // Gasto de anúncio (Meta) do período — respeita o filtro de influencer (via ad_prefix)
  const [metaSpend, setMetaSpend] = useState<{ configurado: boolean; erro: string | null; porDia: Record<string, number>; total: number; semPrefixo?: boolean } | null>(null);

  // Filtro por influenciador ('all' = todos)
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [selectedInfluencer, setSelectedInfluencer] = useState<string>('all');

  // Dados já filtrados pelo influenciador escolhido (alimenta todas as métricas abaixo)
  const data = selectedInfluencer === 'all'
    ? allData
    : allData.filter(d => (d.influencer || '').toLowerCase() === selectedInfluencer);

  // Quando filtra por influenciador, mostra só os codiguins DELE (ex: mila -> MILA, spawnin -> BRASIL)
  const selectedCodes: Set<string> | null = selectedInfluencer === 'all'
    ? null
    : new Set<string>(
        influencers
          .filter(inf => inf.slug === selectedInfluencer && inf.roblox_code)
          .map(inf => (inf.roblox_code as string).toUpperCase())
      );
  const usagesView = selectedCodes
    ? couponUsages.filter(u => selectedCodes.has((u.coupon_code || '').toUpperCase()))
    : couponUsages;

  const [dateRange, setDateRange] = useState<{start: Date, end: Date}>(() => {
    const now = new Date();
    return {
      // Padrão "Tudo": pega todo o histórico e o usuário filtra se quiser
      start: new Date(2020, 0, 1),
      end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    };
  });

  // Filtro rápido ativo (pills) — 'custom' quando usa o calendário
  const [activeRange, setActiveRange] = useState<string>('tudo');

  const applyPreset = (key: string) => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let start: Date;
    if (key === 'hoje') start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (key === '7d') start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    else if (key === '30d') start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    else if (key === 'mes') start = new Date(now.getFullYear(), now.getMonth(), 1);
    else start = new Date(2020, 0, 1); // tudo
    setActiveRange(key);
    setDateRange({ start, end });
  };

  const fetchData = useCallback(async (start: Date, end: Date) => {
    setLoading(true);
    try {
      // O Supabase/PostgREST devolve no máx 1000 linhas por request.
      // Pagina com .range() até trazer TODOS os registros do período.
      const PAGE = 1000;
      let from = 0;
      let all: any[] = [];
      while (true) {
        const { data: page, error } = await supabase
          .from('lp_roblox')
          .select('*')
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);

        if (error) throw error;
        all = all.concat(page || []);
        if (!page || page.length < PAGE) break; // última página
        from += PAGE;
      }
      setAllData(all);
    } catch (err) {
      console.error("Erro ao buscar dados:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(dateRange.start, dateRange.end);
  }, [fetchData, dateRange]);

  useEffect(() => {
    listInfluencers().then(setInfluencers);
  }, []);

  // Busca os resgates de cupom (Roblox) do período selecionado
  useEffect(() => {
    (async () => {
      const PAGE = 1000;
      let from = 0;
      let all: any[] = [];
      try {
        while (true) {
          const { data: page, error } = await supabase
            .from('coupon_usages')
            .select('coupon_code, used_at')
            .gte('used_at', dateRange.start.toISOString())
            .lte('used_at', dateRange.end.toISOString())
            .range(from, from + PAGE - 1);
          if (error) throw error;
          all = all.concat(page || []);
          if (!page || page.length < PAGE) break;
          from += PAGE;
        }
        setCouponUsages(all);
      } catch (e) {
        // Tabela ainda não existe / sync não rodou — segue vazio (sem quebrar)
        setCouponUsages([]);
      }
    })();
  }, [dateRange]);

  // Gasto/custo do Meta — SÓ quando um influenciador está selecionado (usa o ad_prefix dele).
  // Dispara quando `allData` assenta (1 fetch por período, sem duplicar) e lê dateRange/activeRange
  // do closure — sempre atuais quando allData chega, já que allData só troca via fetchData.
  useEffect(() => {
    if (selectedInfluencer === 'all') { setMetaSpend(null); return; } // custo só por influenciador

    const inf = influencers.find(i => i.slug === selectedInfluencer);
    const prefixo = inf?.ad_prefix || undefined;
    if (!prefixo) { setMetaSpend({ configurado: true, erro: null, porDia: {}, total: 0, semPrefixo: true }); return; }

    const rangeSince = diaSP(dateRange.start);
    const until = diaSP(dateRange.end);

    // No preset "Tudo" arranca do 1º acesso do influenciador (evita puxar período morto);
    // num período com data definida usa o range inteiro pra não subestimar o gasto.
    let since = rangeSince;
    if (activeRange === 'tudo') {
      let primeiro = '';
      for (const r of allData) {
        if (!r.created_at || (r.influencer || '').toLowerCase() !== selectedInfluencer) continue;
        const day = diaSP(new Date(r.created_at));
        if (!primeiro || day < primeiro) primeiro = day;
      }
      if (primeiro && primeiro > since) since = primeiro;
    }

    // Meta recusa janela além de ~37 meses (#3018). Clampa em 36; se o período TODO já passou
    // dessa janela, não há gasto pra puxar — mostra zero, sem erro.
    const now = new Date();
    const limite = diaSP(new Date(now.getFullYear(), now.getMonth() - 36, now.getDate()));
    if (until < limite) { setMetaSpend({ configurado: true, erro: null, porDia: {}, total: 0 }); return; }
    if (since < limite) since = limite;

    let active = true;
    setMetaSpend(null);
    (async () => {
      const res = await fetchMetaSpendPorDia({ since, until, prefixo });
      if (!active) return;
      setMetaSpend({ configurado: res.configurado, erro: res.erro, porDia: res.porDia, total: res.total });
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allData, selectedInfluencer, influencers]);

  // Opções do filtro: cadastrados + quaisquer slugs que apareçam nos dados
  const influencerOptions = (() => {
    const map = new Map<string, string>(); // slug -> nome exibido
    influencers.forEach(inf => map.set(inf.slug, inf.name));
    allData.forEach(d => {
      const slug = (d.influencer || '').toLowerCase().trim();
      if (slug && !map.has(slug)) map.set(slug, slug);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  })();

  const handleRangeChange = (start: Date, end: Date) => {
    setActiveRange('custom');
    setDateRange({ start, end });
  };

  // --- CÁLCULOS ROBLOX ---
  const uniqueUsers = data.length;
  const totalViews = data.reduce((acc, curr) => acc + (curr.page_views || 1), 0);

  // --- REDIRECIONAMENTO ---
  // `click_link` = a pessoa foi mandada pro jogo. É a contagem TOTAL e vale
  // também pros registros da LP antiga (com vídeo), onde a saída era o clique
  // no CTA — por isso continua sendo a base de "redirecionados".
  const redirecionados = data.filter(d => d.click_link).length;
  // `redirect_mode` só existe a partir da LP de redirect: diz COMO a pessoa saiu.
  const redirectAuto = data.filter(d => d.redirect_mode === 'auto').length;
  const redirectManual = data.filter(d => d.redirect_mode === 'manual').length;
  // Saíram pro jogo antes de o modo passar a ser registrado (LP com vídeo).
  const redirectHistorico = Math.max(redirecionados - redirectAuto - redirectManual, 0);
  // TOQUES no link de escape. Pode ser mais de um por pessoa: quando o navegador
  // in-app segura o redirect automático, ela toca de novo.
  const toquesManuais = data.reduce((acc, d) => acc + Number(d.manual_clicks || 0), 0);
  // Chegaram na tela de espera e foram embora sem chegar no jogo.
  const saiuAntes = Math.max(uniqueUsers - redirecionados, 0);

  const redirectRate = uniqueUsers > 0 ? ((redirecionados / uniqueUsers) * 100).toFixed(1) : "0.0";
  const saiuAntesRate = uniqueUsers > 0 ? ((saiuAntes / uniqueUsers) * 100).toFixed(1) : "0.0";
  // Auto e manual são medidos entre as saídas que TÊM modo registrado — jogar o
  // histórico no denominador achataria os dois percentuais sem motivo.
  const comModo = redirectAuto + redirectManual;
  const autoRate = comModo > 0 ? ((redirectAuto / comModo) * 100).toFixed(1) : "0.0";
  const manualRate = comModo > 0 ? ((redirectManual / comModo) * 100).toFixed(1) : "0.0";

  // MÉTRICA-HERÓI: conversão geral (acesso -> entrou no jogo)
  const conversaoGeral = redirectRate;

  // --- FUNIL DE REDIRECIONAMENTO ---
  const funnelStages = [
    { label: 'Acessaram a LP', value: uniqueUsers, color: '#a855f7', icon: Users },
    { label: 'Foram pro jogo', value: redirecionados, color: '#22c55e', icon: ExternalLink },
    { label: 'Resgataram Codiguin', value: usagesView.length, color: '#f59e0b', icon: Ticket },
  ];
  const funnelTop = funnelStages[0].value || 1;

  // --- MODO DE SAÍDA: como a pessoa foi parar no jogo ---
  const exitModes = [
    {
      key: 'auto', label: 'Automático', color: '#22c55e', icon: Zap,
      value: redirectAuto, hint: 'O timer estourou e a página foi pro jogo sozinha.',
    },
    {
      key: 'manual', label: 'Clique manual', color: '#f59e0b', icon: MousePointerClick,
      value: redirectManual, hint: 'Tocaram em "Não abriu? Toque aqui" antes do redirect automático.',
    },
    {
      key: 'historico', label: 'LP antiga', color: '#6b7280', icon: PlayCircle,
      value: redirectHistorico, hint: 'Saídas registradas antes deste rastreio existir (LP com vídeo).',
    },
  ].filter(m => m.value > 0);

  // --- DISPOSITIVOS ---
  const deviceCounts = data.reduce((acc: Record<string, number>, row) => {
    const raw = (row.device_type || 'outros').toLowerCase();
    const key = DEVICE_META[raw] ? raw : 'outros';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const deviceData = Object.entries(deviceCounts)
    .map(([key, value]) => ({ key, value: value as number, ...DEVICE_META[key] }))
    .sort((a, b) => b.value - a.value);

  // --- TIMELINE DIÁRIA: acessos + conversões (LP) + resgates de codiguin (Roblox) ---
  // Bucketiza no fuso de São Paulo (mesmo do date_start do Meta) pra casar com o gasto do dia.
  const dayMap: Record<string, { acessos: number; conversoes: number; manual: number; codes: Record<string, number> }> = {};
  const ensureDay = (k: string) => (dayMap[k] = dayMap[k] || { acessos: 0, conversoes: 0, manual: 0, codes: {} });

  data.forEach(row => {
    if (!row.created_at) return;
    const k = diaSP(new Date(row.created_at));
    const b = ensureDay(k);
    b.acessos += 1;
    if (row.click_link) b.conversoes += 1;
    // Sai junto no balão: um dia com muito clique manual é um dia em que a
    // espera incomodou (ou em que o redirect automático travou).
    if (row.redirect_mode === 'manual') b.manual += 1;
  });
  usagesView.forEach(u => {
    if (!u.used_at) return;
    const k = diaSP(new Date(u.used_at));
    const code = (u.coupon_code || '').toUpperCase();
    if (!code) return;
    const b = ensureDay(k);
    b.codes[code] = (b.codes[code] || 0) + 1;
  });
  const conversionTimeline = Object.keys(dayMap).sort().map(k => {
    const [, m, d] = k.split('-');
    const b = dayMap[k];
    const resgates = Object.values(b.codes).reduce((s, n) => s + n, 0);
    return { key: k, label: `${d}/${m}`, acessos: b.acessos, conversoes: b.conversoes, manual: b.manual, resgates, codes: b.codes };
  });

  // Cruza o GASTO (Meta) de cada dia com a timeline e calcula os custos do dia — vão pro balão.
  const gastoAtivo = selectedInfluencer !== 'all' && !!(metaSpend && metaSpend.configurado && !metaSpend.semPrefixo && !metaSpend.erro);
  const timelineComGasto = conversionTimeline.map(row => {
    const gasto = metaSpend?.porDia?.[row.key] ?? 0;
    return {
      ...row,
      gastoAtivo,
      gasto,
      custoAcesso: row.acessos > 0 ? gasto / row.acessos : 0,
      custoConversao: row.conversoes > 0 ? gasto / row.conversoes : 0,
      custoResgate: row.resgates > 0 ? gasto / row.resgates : 0,
    };
  });

  // --- ORIGEM / INFLUENCIADORES ---
  // Agrupa por influenciador e, dentro dele, quebra por rede social (uma linha por rede)
  const influencerMap = data.reduce((acc: Record<string, any>, row) => {
    const inf = (row.influencer || '').trim();
    if (!inf) return acc; // ignora acessos diretos (sem origem)
    const key = inf.toLowerCase();
    if (!acc[key]) {
      acc[key] = { influencer: inf, users: 0, redirects: 0, auto: 0, manual: 0, socials: {} as Record<string, any> };
    }
    // `redirects` é o total que saiu pro jogo; `auto`/`manual` quebram esse
    // total por COMO a pessoa saiu (a soma pode dar menos que `redirects`
    // quando há registros da LP antiga, que não gravavam o modo).
    const bump = (g: any) => {
      g.users += 1;
      if (row.click_link) g.redirects += 1;
      if (row.redirect_mode === 'auto') g.auto += 1;
      if (row.redirect_mode === 'manual') g.manual += 1;
    };
    bump(acc[key]);

    // Rede social (vazio = "direto", quando entrou só com /influenciador sem rede)
    const g = acc[key];
    const social = (row.social_network || '').trim().toLowerCase() || 'direto';
    if (!g.socials[social]) g.socials[social] = { users: 0, redirects: 0, auto: 0, manual: 0 };
    bump(g.socials[social]);
    return acc;
  }, {});

  const originGroups: any[] = Object.values(influencerMap)
    .map((g: any) => ({
      ...g,
      socialList: Object.entries(g.socials)
        .map(([name, v]: [string, any]) => ({ name, ...v }))
        .sort((a, b) => b.users - a.users),
    }))
    .sort((a: any, b: any) => b.users - a.users);

  // Acessos diretos (sem influenciador na URL) viram uma entrada "Link direto"
  const directRows = data.filter(d => !(d.influencer || '').trim());
  const acessosDiretos = directRows.length;
  const directGroup = directRows.length > 0 ? {
    influencer: 'Link direto',
    isDirect: true,
    users: directRows.length,
    redirects: directRows.filter(d => d.click_link).length,
    auto: directRows.filter(d => d.redirect_mode === 'auto').length,
    manual: directRows.filter(d => d.redirect_mode === 'manual').length,
    socialList: [] as any[],
  } : null;

  // Escala das barras considera também o tráfego direto
  const topOriginUsers = Math.max(
    originGroups.length > 0 ? originGroups[0].users : 0,
    directGroup ? directGroup.users : 0,
    1
  );

  // --- CONVERSÃO FINAL NO ROBLOX (resgates de codiguin no período) ---
  const robloxTotal = usagesView.length;
  const usageByCode: Record<string, number> = {};
  usagesView.forEach(u => {
    const c = (u.coupon_code || '').toUpperCase();
    if (c) usageByCode[c] = (usageByCode[c] || 0) + 1;
  });
  const codeToInfluencers: Record<string, string[]> = {};
  influencers.forEach(inf => {
    if (inf.roblox_code) {
      const c = inf.roblox_code.toUpperCase();
      (codeToInfluencers[c] = codeToInfluencers[c] || []).push(inf.name);
    }
  });
  // Quando filtra por influenciador, só os códigos DELE entram no ranking de codiguins.
  // Anotação explícita: sem ela o TS infere `unknown[]` do ternário entre os dois
  // `Array.from` e reclama ao usar `code` como índice logo abaixo.
  const codeUniverse: string[] = selectedCodes
    ? Array.from(selectedCodes)
    : Array.from(new Set<string>([...Object.keys(usageByCode), ...Object.keys(codeToInfluencers)]));
  const robloxBreakdown = codeUniverse
    .map(code => ({ code, count: usageByCode[code] || 0, influencers: codeToInfluencers[code] || [] }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Roblox Analytics</h1>
          <p>Métricas reais de engajamento e conversão da Landing Page.</p>
        </div>
        <div className={styles.controlsCol}>
          <div className={styles.controlsArea}>
            <div className={styles.inputGroup}>
              <label>Influenciador</label>
              <InfluencerPicker
                value={selectedInfluencer}
                onChange={setSelectedInfluencer}
                options={influencerOptions.map(([slug, name]) => ({ value: slug, label: name, slug }))}
              />
            </div>
            <div className={styles.inputGroup}>
              <label>Período personalizado</label>
              <CustomDatePicker onRangeChange={handleRangeChange} value={dateRange} />
            </div>
            <div className={styles.inputGroup}>
              <label>&nbsp;</label>
              <Link to="/admin/influenciadores" className={styles.manageBtn}>
                <Users2 size={16} /> Gerenciar
              </Link>
            </div>
          </div>

          {/* Filtros rápidos de período — logo abaixo da data */}
          <div className={styles.quickBar}>
            {[
              { key: 'tudo', label: 'Tudo' },
              { key: 'hoje', label: 'Hoje' },
              { key: '7d', label: '7 dias' },
              { key: '30d', label: '30 dias' },
              { key: 'mes', label: 'Este mês' },
            ].map(p => (
              <button
                key={p.key}
                className={`${styles.quickPill} ${activeRange === p.key ? styles.quickPillActive : ''}`}
                onClick={() => applyPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
            {activeRange === 'custom' && (
              <span className={`${styles.quickPill} ${styles.quickPillActive}`}>Personalizado</span>
            )}
          </div>
        </div>
      </header>

      {loading && <div className={styles.loadingBar}><span /></div>}

      {/* FILEIRA 1: Visão Geral + Conversão Herói */}
      <h2 className={styles.sectionHeader}>VISÃO GERAL</h2>
      <div className={styles.kpiGrid}>
        <KpiCard
          title="USUÁRIOS ÚNICOS"
          value={uniqueUsers.toLocaleString('pt-BR')}
          subtitle="Visitantes únicos (visitor_id)"
          icon={Users}
          color="#a855f7"
        />
        <KpiCard
          title="TOTAL DE VIEWS"
          value={totalViews.toLocaleString('pt-BR')}
          subtitle="Soma de visualizações da página"
          icon={Eye}
          color="#3b82f6"
        />
        <KpiCard
          title="REDIRECIONADOS"
          value={redirecionados.toLocaleString('pt-BR')}
          subtitle={`${redirectRate}% dos acessos únicos foram pro jogo`}
          icon={ExternalLink}
          color="#22c55e"
          highlight
        />
        <KpiCard
          title="SAÍRAM ANTES"
          value={saiuAntes.toLocaleString('pt-BR')}
          subtitle={`${saiuAntesRate}% fecharam a página sem chegar no jogo`}
          icon={AlertTriangle}
          color="#ef4444"
        />
      </div>

      {/* FILEIRA 1.5: Como a pessoa saiu (automático x manual) + conversão geral */}
      <div className={styles.secondaryStrip}>
        <div className={styles.miniStat}>
          <div className={styles.miniStatIcon} style={{ backgroundColor: '#22c55e19' }}>
            <Zap size={22} color="#22c55e" />
          </div>
          <div>
            <div className={styles.miniStatValue}>{redirectAuto.toLocaleString('pt-BR')}</div>
            <div className={styles.miniStatLabel}>Redirect automático ({autoRate}% das saídas rastreadas)</div>
          </div>
        </div>
        <div className={styles.miniStat}>
          <div className={styles.miniStatIcon} style={{ backgroundColor: '#f59e0b19' }}>
            <MousePointerClick size={22} color="#f59e0b" />
          </div>
          <div>
            <div className={styles.miniStatValue}>{redirectManual.toLocaleString('pt-BR')}</div>
            <div className={styles.miniStatLabel}>
              Clicaram no link antes ({manualRate}% das saídas
              {toquesManuais > redirectManual ? ` · ${toquesManuais.toLocaleString('pt-BR')} toques no total` : ''})
            </div>
          </div>
        </div>
        <div className={`${styles.miniStat} ${styles.miniStatHighlight}`}>
          <div className={styles.miniStatIcon} style={{ backgroundColor: '#00e5ff19' }}>
            <Target size={22} color="#00e5ff" />
          </div>
          <div>
            <div className={styles.miniStatValue} style={{ color: '#00e5ff' }}>{conversaoGeral}%</div>
            <div className={styles.miniStatLabel}>Conversão geral — acessos que entraram no jogo</div>
          </div>
        </div>
      </div>

      {/* FILEIRA 2: Funil do redirect + como cada pessoa saiu, lado a lado */}
      <h2 className={styles.sectionHeader}>REDIRECIONAMENTO</h2>
      <div className={styles.funnelChartGrid}>
        {/* FUNIL: acesso -> jogo -> codiguin */}
        <div className={styles.panel}>
          <div className={styles.cardTitle}>
            <Filter size={20} color="#22c55e" />
            Funil de Redirecionamento
          </div>
          <p className={styles.panelSub}>Quantos acessos chegaram de fato ao jogo (e ao codiguin)</p>
          <div className={styles.funnel}>
            {funnelStages.map((stage, i) => {
              const widthPct = Math.max((stage.value / funnelTop) * 100, 4);
              const prev = i > 0 ? funnelStages[i - 1].value : stage.value;
              const ofPrev = prev > 0 ? (stage.value / prev) * 100 : 0;
              const ofTotal = funnelTop > 0 ? (stage.value / funnelTop) * 100 : 0;
              const drop = i > 0 ? (100 - ofPrev) : 0;
              const StageIcon = stage.icon;
              return (
                <div key={i} className={styles.funnelRow}>
                  <div className={styles.funnelInfo}>
                    <StageIcon size={15} color={stage.color} />
                    <span className={styles.funnelLabel}>{stage.label}</span>
                    {i > 0 && drop > 0 && (
                      <span className={styles.funnelDrop}>↓ {drop.toFixed(0)}% de queda</span>
                    )}
                  </div>
                  <div className={styles.funnelBarTrack}>
                    <div
                      className={styles.funnelBar}
                      style={{ width: `${widthPct}%`, background: `linear-gradient(90deg, ${stage.color}cc, ${stage.color})` }}
                    >
                      <span className={styles.funnelValue}>{stage.value.toLocaleString('pt-BR')}</span>
                    </div>
                    <span className={styles.funnelPct}>{ofTotal.toFixed(0)}% dos acessos</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COMO SAIU: automático x clique manual */}
        <div className={styles.panel}>
          <div className={styles.cardTitle}>
            <Split size={20} color="#f59e0b" />
            Como a pessoa saiu pro jogo
          </div>
          <p className={styles.panelSub}>
            Muito clique manual = a espera está longa demais (ou o navegador está segurando o redirect)
          </p>
          {redirecionados === 0 ? (
            <div className={styles.emptyMini}>Ninguém foi redirecionado no período.</div>
          ) : (
            <div className={styles.deviceRow}>
              <div className={styles.donutWrap}>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={exitModes}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={90}
                      // Com uma fatia só o `paddingAngle` come o arco inteiro e
                      // a rosca some — o respiro entre fatias só faz sentido
                      // quando existe mais de uma.
                      paddingAngle={exitModes.length > 1 ? 3 : 0}
                      stroke="none"
                    >
                      {exitModes.map((m, i) => <Cell key={i} fill={m.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#16161b', borderColor: '#2a2a35', color: '#fff', borderRadius: '8px' }}
                      formatter={(value: any, name: any) => [`${value} pessoas`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className={styles.donutCenter}>
                  <div className={styles.donutCenterValue}>{redirecionados.toLocaleString('pt-BR')}</div>
                  <div className={styles.donutCenterLabel}>no jogo</div>
                </div>
              </div>
              <div className={styles.deviceBars}>
                {exitModes.map((m, i) => {
                  const pct = redirecionados > 0 ? Math.round((m.value / redirecionados) * 100) : 0;
                  const MIcon = m.icon;
                  return (
                    <div key={i} className={styles.deviceBarRow} title={m.hint}>
                      <div className={styles.deviceBarIcon} style={{ backgroundColor: `${m.color}1A` }}>
                        <MIcon size={18} color={m.color} />
                      </div>
                      <div className={styles.deviceBarLabel}>
                        <span className={styles.deviceBarName}>{m.label}</span>
                        <span className={styles.deviceBarCount}>{m.value.toLocaleString('pt-BR')} pessoas</span>
                      </div>
                      <div className={styles.deviceBarTrack}>
                        <div className={styles.deviceBarFill} style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${m.color}aa, ${m.color})` }} />
                      </div>
                      <span className={styles.deviceBarPct} style={{ color: m.color }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FILEIRA 2.5: Desempenho de conversão ao longo do tempo */}
      <h2 className={styles.sectionHeader}>DESEMPENHO DE CONVERSÃO</h2>
      <div className={styles.panel}>
        <div className={styles.cardTitle}>
          <TrendingUp size={20} color="#22c55e" />
          Redirecionamentos ao longo do tempo
        </div>
        <p className={styles.panelSub}>Quantas pessoas foram pro jogo a cada dia (vs. quantas acessaram)</p>

        {/* Gasto/custo do Meta — só quando um influenciador está selecionado. Detalhe por dia no balão. */}
        {selectedInfluencer !== 'all' && (
          metaSpend === null ? (
            <div style={spendNoteStyle}><DollarSign size={14} /> Carregando gasto de anúncios…</div>
          ) : !metaSpend.configurado ? (
            <div style={spendNoteStyle}><Info size={14} /> Gasto do Meta não configurado (defina o token no .env.local).</div>
          ) : metaSpend.semPrefixo ? (
            <div style={spendNoteStyle}><Info size={14} /> Defina o prefixo de campanha deste influenciador pra ver o gasto atribuído a ele.</div>
          ) : metaSpend.erro ? (
            <div style={{ ...spendNoteStyle, color: '#fca5a5' }}><AlertTriangle size={14} /> Meta: {metaSpend.erro}</div>
          ) : (
            <div style={spendNoteStyle}>
              <DollarSign size={14} color="#22c55e" />
              <span>Investido no período: <b style={{ color: '#22c55e' }}>{brl(metaSpend.total)}</b></span>
              <span style={{ opacity: 0.65 }}>— custo por acesso/conversão/resgate no balão</span>
            </div>
          )
        )}

        {conversionTimeline.length === 0 ? (
          <div className={styles.emptyMini}>Sem dados no período.</div>
        ) : (
          <div style={{ width: '100%', height: 320, marginTop: 12 }}>
            <ResponsiveContainer>
              <ComposedChart data={timelineComGasto} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradAcessos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.35} />
                  </linearGradient>
                  <linearGradient id="gradConv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#23232c" />
                <XAxis dataKey="label" stroke="#8b8b93" fontSize={12} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis stroke="#8b8b93" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ConversionTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Bar dataKey="acessos" name="Acessos" fill="url(#gradAcessos)" radius={[6, 6, 0, 0]} maxBarSize={46} />
                <Area type="monotone" dataKey="conversoes" name="Redirecionados" stroke="#22c55e" strokeWidth={3} fill="url(#gradConv)" dot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#fff', stroke: '#22c55e', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="resgates" name="Resgates (Roblox)" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#fff', stroke: '#f59e0b', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* FILEIRA 3: Dispositivos (roxo) full-width */}
      <h2 className={styles.sectionHeader}>ENTRADAS POR DISPOSITIVO</h2>
      <div className={styles.panel}>
        {uniqueUsers === 0 ? (
          <div className={styles.emptyMini}>Sem dados no período.</div>
        ) : (
          <div className={styles.deviceRow}>
            <div className={styles.donutWrap}>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={deviceData}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={90}
                    // Idem ao donut de modo de saída: uma fatia só + paddingAngle
                    // faz a rosca sumir.
                    paddingAngle={deviceData.length > 1 ? 3 : 0}
                    stroke="none"
                  >
                    {deviceData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#16161b', borderColor: '#2a2a35', color: '#fff', borderRadius: '8px' }}
                    formatter={(value: any, name: any) => [`${value} usuários`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.donutCenter}>
                <div className={styles.donutCenterValue}>{uniqueUsers}</div>
                <div className={styles.donutCenterLabel}>usuários</div>
              </div>
            </div>
            <div className={styles.deviceBars}>
              {deviceData.map((d, i) => {
                const pct = uniqueUsers > 0 ? Math.round((d.value / uniqueUsers) * 100) : 0;
                const DIcon = d.icon;
                return (
                  <div key={i} className={styles.deviceBarRow}>
                    <div className={styles.deviceBarIcon} style={{ backgroundColor: `${d.color}1A` }}>
                      <DIcon size={18} color={d.color} />
                    </div>
                    <div className={styles.deviceBarLabel}>
                      <span className={styles.deviceBarName}>{d.label}</span>
                      <span className={styles.deviceBarCount}>{d.value} usuários</span>
                    </div>
                    <div className={styles.deviceBarTrack}>
                      <div className={styles.deviceBarFill} style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${d.color}aa, ${d.color})` }} />
                    </div>
                    <span className={styles.deviceBarPct} style={{ color: d.color }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* FILEIRA 4: Ranking de Influenciadores */}
      <h2 className={styles.sectionHeader}>
        ORIGEM DO TRÁFEGO — RANKING DE INFLUENCIADORES
      </h2>
      <div className={styles.panel}>
        <div className={styles.originSummary}>
          <span><strong>{originGroups.length}</strong> origem(ns) rastreada(s)</span>
          <span><strong>{acessosDiretos}</strong> acesso(s) direto(s) (sem link)</span>
        </div>
        {originGroups.length === 0 && !directGroup ? (
          <div className={styles.originEmpty}>
            Nenhuma origem rastreada ainda. Use links no formato
            <code> /nome-do-influenciador/rede-social</code> para começar a rastrear.
          </div>
        ) : (
          <div className={styles.ranking}>
            {originGroups.map((g: any, i: number) => {
              const conv = g.users > 0 ? ((g.redirects / g.users) * 100).toFixed(1) : "0.0";
              const barWidth = Math.max((g.users / topOriginUsers) * 100, 6);
              const isTop = i === 0;
              return (
                <div key={i} className={styles.rankCard}>
                  <div className={styles.rankCardHead}>
                    <div className={`${styles.rankPos} ${isTop ? styles.rankPosTop : ''}`}>
                      {isTop ? <Trophy size={16} /> : `#${i + 1}`}
                    </div>
                    <div className={styles.rankIdentity}>
                      <span className={styles.rankName}>{g.influencer}</span>
                      <div className={styles.rankMeta}>
                        <span><ExternalLink size={13} /> {g.redirects} no jogo</span>
                        <span><Zap size={13} /> {g.auto} automático</span>
                        <span><MousePointerClick size={13} /> {g.manual} manual</span>
                      </div>
                    </div>
                    <div className={styles.rankKpi}>
                      <div className={styles.rankKpiVal}>{g.users.toLocaleString('pt-BR')}</div>
                      <div className={styles.rankKpiLabel}>usuários</div>
                    </div>
                    <div className={styles.rankKpiDivider} />
                    <div className={styles.rankKpi}>
                      <div className={styles.rankKpiVal} style={{ color: '#22c55e' }}>{conv}%</div>
                      <div className={styles.rankKpiLabel}>conversão</div>
                    </div>
                  </div>

                  <div className={styles.rankBarTrack}>
                    <div className={styles.rankBar} style={{ width: `${barWidth}%` }} />
                  </div>

                  {/* Quebra por rede social: uma linha pra cada rede */}
                  <div className={styles.socialBlock}>
                    <div className={styles.socialBlockTitle}>POR REDE SOCIAL</div>
                    {g.socialList.map((s: any, si: number) => {
                      const sConv = s.users > 0 ? Math.round((s.redirects / s.users) * 100) : 0;
                      const sWidth = Math.max((s.users / g.users) * 100, 4);
                      const sColor = SOCIAL_COLOR[s.name] || '#a855f7';
                      return (
                        <div key={si} className={styles.socialRow}>
                          <span className={styles.socialRowName}>
                            <span className={styles.socialDot} style={{ backgroundColor: sColor }} />
                            {socialLabel(s.name)}
                          </span>
                          <div className={styles.socialRowBarTrack}>
                            <div className={styles.socialRowBar} style={{ width: `${sWidth}%`, background: `linear-gradient(90deg, ${sColor}99, ${sColor})` }} />
                          </div>
                          <span className={styles.socialRowUsers}>{s.users} usuários</span>
                          <span className={styles.socialRowExtra}>{s.redirects} no jogo · {s.manual} manual · {sConv}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Tráfego direto: quem entrou sem link de influenciador */}
            {directGroup && (
              <div className={`${styles.rankCard} ${styles.rankCardDirect}`}>
                <div className={styles.rankCardHead}>
                  <div className={styles.rankPos}>
                    <Link2 size={16} />
                  </div>
                  <div className={styles.rankIdentity}>
                    <span className={styles.rankName}>Link direto</span>
                    <div className={styles.rankMeta}>
                      <span>Entraram direto, sem influenciador</span>
                      <span><ExternalLink size={13} /> {directGroup.redirects} no jogo</span>
                      <span><Zap size={13} /> {directGroup.auto} automático</span>
                      <span><MousePointerClick size={13} /> {directGroup.manual} manual</span>
                    </div>
                  </div>
                  <div className={styles.rankKpi}>
                    <div className={styles.rankKpiVal}>{directGroup.users.toLocaleString('pt-BR')}</div>
                    <div className={styles.rankKpiLabel}>usuários</div>
                  </div>
                  <div className={styles.rankKpiDivider} />
                  <div className={styles.rankKpi}>
                    <div className={styles.rankKpiVal} style={{ color: '#22c55e' }}>
                      {directGroup.users > 0 ? ((directGroup.redirects / directGroup.users) * 100).toFixed(1) : "0.0"}%
                    </div>
                    <div className={styles.rankKpiLabel}>conversão</div>
                  </div>
                </div>
                <div className={styles.rankBarTrack}>
                  <div
                    className={styles.rankBar}
                    style={{ width: `${Math.max((directGroup.users / topOriginUsers) * 100, 6)}%`, background: 'linear-gradient(90deg, #4b5563, #6b7280)' }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CONVERSÃO FINAL NO ROBLOX (resgates de codiguin) */}
      <h2 className={styles.sectionHeader}>CONVERSÃO FINAL NO ROBLOX — CODIGUINS</h2>
      <div className={styles.panel}>
        <div className={styles.originSummary}>
          <span><strong>{robloxTotal.toLocaleString('pt-BR')}</strong> resgate(s) de cupom no Roblox no período</span>
        </div>
        {robloxBreakdown.length === 0 ? (
          <div className={styles.originEmpty}>
            Nenhum resgate ainda. Cadastre o <code>codiguin</code> dos influenciadores e ative o
            sync com a API do Roblox pra ver a conversão final aqui.
          </div>
        ) : (
          <div className={styles.codeList}>
            {robloxBreakdown.map((r, i) => (
              <div key={i} className={styles.codeRow}>
                <span className={styles.codeTag}>🎟️ {r.code}</span>
                <span className={styles.codeInf}>
                  {r.influencers.length ? r.influencers.join(', ') : <em>sem influenciador vinculado</em>}
                </span>
                <span className={styles.rankSpacer} />
                <span className={styles.codeCount}>{r.count.toLocaleString('pt-BR')}</span>
                <span className={styles.codeCountLabel}>resgates</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
