import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { listInfluencers, Influencer } from '../../lib/influencers';
import styles from './AdminDashboard.module.css';
import CustomDatePicker from './CustomDatePicker';
import InfluencerPicker from './InfluencerPicker';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Bar, Line, Legend } from 'recharts';
import {
  Users, Eye, Clock, PlayCircle, AlertTriangle, MousePointerClick, BarChart2,
  Target, Smartphone, Monitor, Tablet, Trophy, Filter, Users2, Link2, TrendingUp
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
      <div className={styles.convTooltipRow}><span>Acessos</span><b>{row.acessos ?? 0}</b></div>
      <div className={styles.convTooltipRow} style={{ color: '#22c55e' }}><span>Conversões (LP)</span><b>{row.conversoes ?? 0}</b></div>
      <div className={styles.convTooltipRow} style={{ color: '#f59e0b' }}><span>Resgates (Roblox)</span><b>{row.resgates ?? 0}</b></div>
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

  // Filtro por influenciador ('all' = todos)
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [selectedInfluencer, setSelectedInfluencer] = useState<string>('all');

  // Dados já filtrados pelo influenciador escolhido (alimenta todas as métricas abaixo)
  const data = selectedInfluencer === 'all'
    ? allData
    : allData.filter(d => (d.influencer || '').toLowerCase() === selectedInfluencer);

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

  const playsData = data.filter(d => d.click_start);
  const plays = playsData.length;

  const avgTime = plays > 0
    ? (playsData.reduce((acc, curr) => acc + Number(curr.exact_percentage_viewed || 0), 0) / plays).toFixed(1)
    : "0.0";

  const iniciaramVideo = plays;
  const iniciaramVideoRate = uniqueUsers > 0 ? ((iniciaramVideo / uniqueUsers) * 100).toFixed(1) : "0.0";

  // SOMA TOTAL DE CLIQUES NA ESPERA
  const totalCliquesEspera = data.reduce((acc, curr) => acc + Number(curr.click_calma || 0), 0);
  const usersClicaramEspera = data.filter(d => Number(d.click_calma || 0) > 0).length;
  const esperaRate = iniciaramVideo > 0 ? ((usersClicaramEspera / iniciaramVideo) * 100).toFixed(1) : "0.0";

  const foramProLink = data.filter(d => d.click_link).length;
  const linkRate = iniciaramVideo > 0 ? ((foramProLink / iniciaramVideo) * 100).toFixed(1) : "0.0";

  // MÉTRICA-HERÓI: conversão geral (acesso -> entrou no jogo)
  const conversaoGeral = uniqueUsers > 0 ? ((foramProLink / uniqueUsers) * 100).toFixed(1) : "0.0";

  // Gráfico de Retenção
  const chartData = Array.from({ length: 101 }, (_, index) => ({
    percentage: index,
    users: playsData.filter(row => Number(row.exact_percentage_viewed || 0) >= index).length
  }));

  // --- FUNIL DE RETENÇÃO DO VÍDEO (quanto cada pessoa assistiu) ---
  const countAtLeast = (pct: number) => data.filter(d => Number(d.max_percentage_viewed || 0) >= pct).length;
  const funnelStages = [
    { label: 'Deram Play', value: plays, color: '#3b82f6', icon: PlayCircle },
    { label: 'Viram 25%', value: countAtLeast(25), color: '#06b6d4', icon: Eye },
    { label: 'Viram 50%', value: countAtLeast(50), color: '#10b981', icon: Eye },
    { label: 'Viram 75%', value: countAtLeast(75), color: '#22c55e', icon: Eye },
    { label: 'Viram 95%', value: countAtLeast(95), color: '#84cc16', icon: Eye },
    { label: 'Assistiram 100%', value: countAtLeast(100), color: '#f59e0b', icon: Trophy },
    { label: 'Clicaram no Link', value: foramProLink, color: '#ec4899', icon: MousePointerClick },
  ];
  const funnelTop = funnelStages[0].value || 1;

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
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const dayMap: Record<string, { acessos: number; conversoes: number; codes: Record<string, number> }> = {};
  const ensureDay = (k: string) => (dayMap[k] = dayMap[k] || { acessos: 0, conversoes: 0, codes: {} });

  data.forEach(row => {
    if (!row.created_at) return;
    const dt = new Date(row.created_at);
    const k = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
    const b = ensureDay(k);
    b.acessos += 1;
    if (row.click_link) b.conversoes += 1;
  });
  couponUsages.forEach(u => {
    if (!u.used_at) return;
    const dt = new Date(u.used_at);
    const k = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
    const code = (u.coupon_code || '').toUpperCase();
    if (!code) return;
    const b = ensureDay(k);
    b.codes[code] = (b.codes[code] || 0) + 1;
  });
  const conversionTimeline = Object.keys(dayMap).sort().map(k => {
    const [, m, d] = k.split('-');
    const b = dayMap[k];
    const resgates = Object.values(b.codes).reduce((s, n) => s + n, 0);
    return { label: `${d}/${m}`, acessos: b.acessos, conversoes: b.conversoes, resgates, codes: b.codes };
  });

  // --- ORIGEM / INFLUENCIADORES ---
  // Agrupa por influenciador e, dentro dele, quebra por rede social (uma linha por rede)
  const influencerMap = data.reduce((acc: Record<string, any>, row) => {
    const inf = (row.influencer || '').trim();
    if (!inf) return acc; // ignora acessos diretos (sem origem)
    const key = inf.toLowerCase();
    if (!acc[key]) {
      acc[key] = { influencer: inf, users: 0, plays: 0, links: 0, socials: {} as Record<string, any> };
    }
    const g = acc[key];
    g.users += 1;
    if (row.click_start) g.plays += 1;
    if (row.click_link) g.links += 1;

    // Rede social (vazio = "direto", quando entrou só com /influenciador sem rede)
    const social = (row.social_network || '').trim().toLowerCase() || 'direto';
    if (!g.socials[social]) g.socials[social] = { users: 0, plays: 0, links: 0 };
    g.socials[social].users += 1;
    if (row.click_start) g.socials[social].plays += 1;
    if (row.click_link) g.socials[social].links += 1;
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
    plays: directRows.filter(d => d.click_start).length,
    links: directRows.filter(d => d.click_link).length,
    socialList: [] as any[],
  } : null;

  // Escala das barras considera também o tráfego direto
  const topOriginUsers = Math.max(
    originGroups.length > 0 ? originGroups[0].users : 0,
    directGroup ? directGroup.users : 0,
    1
  );

  // --- CONVERSÃO FINAL NO ROBLOX (resgates de codiguin no período) ---
  const robloxTotal = couponUsages.length;
  const usageByCode: Record<string, number> = {};
  couponUsages.forEach(u => {
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
  const robloxBreakdown = Array.from(new Set([...Object.keys(usageByCode), ...Object.keys(codeToInfluencers)]))
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
          title="INICIARAM O VÍDEO"
          value={iniciaramVideo.toLocaleString('pt-BR')}
          subtitle={`${iniciaramVideoRate}% dos acessos únicos`}
          icon={PlayCircle}
          color="#22c55e"
        />
        <KpiCard
          title="CLIQUES NA ESPERA"
          value={totalCliquesEspera.toLocaleString('pt-BR')}
          subtitle={`${esperaRate}% de quem deu play se frustrou`}
          icon={AlertTriangle}
          color="#ef4444"
        />
      </div>

      {/* FILEIRA 1.5: Stats secundários (Foram pro Link, Tempo médio, Conversão geral) */}
      <div className={styles.secondaryStrip}>
        <div className={styles.miniStat}>
          <div className={styles.miniStatIcon} style={{ backgroundColor: '#f59e0b19' }}>
            <MousePointerClick size={22} color="#f59e0b" />
          </div>
          <div>
            <div className={styles.miniStatValue}>{foramProLink.toLocaleString('pt-BR')}</div>
            <div className={styles.miniStatLabel}>Foram pro link ({linkRate}% de quem deu play)</div>
          </div>
        </div>
        <div className={styles.miniStat}>
          <div className={styles.miniStatIcon} style={{ backgroundColor: '#10b98119' }}>
            <Clock size={22} color="#10b981" />
          </div>
          <div>
            <div className={styles.miniStatValue}>{avgTime}%</div>
            <div className={styles.miniStatLabel}>Tempo médio assistido (quem deu play)</div>
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

      {/* FILEIRA 2: Funil de Retenção (verde) + Curva de Retenção (vermelha) lado a lado */}
      <h2 className={styles.sectionHeader}>RETENÇÃO DO VÍDEO</h2>
      <div className={styles.funnelChartGrid}>
        {/* FUNIL (verde) */}
        <div className={styles.panel}>
          <div className={styles.cardTitle}>
            <Filter size={20} color="#22c55e" />
            Funil de Retenção do Vídeo
          </div>
          <p className={styles.panelSub}>Quanto do vídeo cada pessoa que deu play assistiu</p>
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
                    <span className={styles.funnelPct}>{ofTotal.toFixed(0)}% dos plays</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CURVA DE RETENÇÃO (vermelha) */}
        <div className={styles.chartCard}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <BarChart2 size={20} color="#ef4444" />
              Curva de Retenção
            </div>
          </div>
          <p className={styles.panelSub} style={{ marginTop: '-12px', marginBottom: '8px' }}>
            Quantos espectadores ainda estavam assistindo em cada ponto do vídeo
          </p>
          <div className={styles.chartWrapper} style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2a2a35" />
                  <XAxis dataKey="percentage" stroke="#8b8b93" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} minTickGap={30} />
                  <YAxis stroke="#8b8b93" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#16161b', borderColor: '#2a2a35', color: '#fff', borderRadius: '8px' }}
                    itemStyle={{ color: '#f87171', fontWeight: 'bold' }}
                    labelStyle={{ color: '#8b8b93', marginBottom: '4px' }}
                    formatter={(value: any) => [`${value} espectadores`, 'Audiência']}
                    labelFormatter={(label) => `Chegaram em ${label}% do vídeo`}
                  />
                  <Area type="monotone" dataKey="users" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorUsers)" activeDot={{ r: 6, fill: "#fff", stroke: "#ef4444", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* FILEIRA 2.5: Desempenho de conversão ao longo do tempo */}
      <h2 className={styles.sectionHeader}>DESEMPENHO DE CONVERSÃO</h2>
      <div className={styles.panel}>
        <div className={styles.cardTitle}>
          <TrendingUp size={20} color="#22c55e" />
          Conversões ao longo do tempo
        </div>
        <p className={styles.panelSub}>Quantas pessoas foram pro jogo a cada dia (vs. quantas acessaram)</p>
        {conversionTimeline.length === 0 ? (
          <div className={styles.emptyMini}>Sem dados no período.</div>
        ) : (
          <div style={{ width: '100%', height: 320, marginTop: 12 }}>
            <ResponsiveContainer>
              <ComposedChart data={conversionTimeline} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
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
                <Area type="monotone" dataKey="conversoes" name="Conversões" stroke="#22c55e" strokeWidth={3} fill="url(#gradConv)" dot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#fff', stroke: '#22c55e', strokeWidth: 2 }} />
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
                    paddingAngle={3}
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
              const conv = g.users > 0 ? ((g.links / g.users) * 100).toFixed(1) : "0.0";
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
                        <span><PlayCircle size={13} /> {g.plays} plays</span>
                        <span><MousePointerClick size={13} /> {g.links} no link</span>
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
                      const sConv = s.users > 0 ? Math.round((s.links / s.users) * 100) : 0;
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
                          <span className={styles.socialRowExtra}>{s.plays} plays · {s.links} link · {sConv}%</span>
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
                      <span><PlayCircle size={13} /> {directGroup.plays} plays</span>
                      <span><MousePointerClick size={13} /> {directGroup.links} no link</span>
                    </div>
                  </div>
                  <div className={styles.rankKpi}>
                    <div className={styles.rankKpiVal}>{directGroup.users.toLocaleString('pt-BR')}</div>
                    <div className={styles.rankKpiLabel}>usuários</div>
                  </div>
                  <div className={styles.rankKpiDivider} />
                  <div className={styles.rankKpi}>
                    <div className={styles.rankKpiVal} style={{ color: '#22c55e' }}>
                      {directGroup.users > 0 ? ((directGroup.links / directGroup.users) * 100).toFixed(1) : "0.0"}%
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
