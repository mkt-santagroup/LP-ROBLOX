import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import styles from './AdminDashboard.module.css';
import CustomDatePicker from './CustomDatePicker';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Eye, Clock, PlayCircle, AlertTriangle, MousePointerClick, BarChart2 } from 'lucide-react';

const KpiCard = ({ title, value, subtitle, icon: Icon, color = "#a855f7" }: any) => (
  <div className={styles.kpiCard}>
    <div className={styles.kpiTop}>
      <div>
        <div className={styles.kpiTitle}>{title}</div>
        <div className={styles.kpiValue}>{value}</div>
      </div>
      <div className={styles.kpiIcon} style={{ backgroundColor: `${color}1A` }}>
        <Icon size={24} color={color} />
      </div>
    </div>
    <div className={styles.kpiBottom}>
      {subtitle && <div className={styles.kpiCompare}>{subtitle}</div>}
    </div>
  </div>
);

export default function AdminDashboard() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [dateRange, setDateRange] = useState<{start: Date, end: Date}>(() => {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    };
  });

  const fetchData = useCallback(async (start: Date, end: Date) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase
        .from('lp_roblox')
        .select('*')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      setData(result || []);
    } catch (err) {
      console.error("Erro ao buscar dados:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(dateRange.start, dateRange.end);
  }, [fetchData, dateRange]);

  const handleRangeChange = (start: Date, end: Date) => {
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

  // SOMA TOTAL DE CLIQUES NA ESPERA (O que você pediu!)
  const totalCliquesEspera = data.reduce((acc, curr) => acc + Number(curr.click_calma || 0), 0);
  
  // Taxa de usuários únicos que clicaram na espera (para o subtítulo)
  const usersClicaramEspera = data.filter(d => Number(d.click_calma || 0) > 0).length;
  const esperaRate = iniciaramVideo > 0 ? ((usersClicaramEspera / iniciaramVideo) * 100).toFixed(1) : "0.0";

  const foramProLink = data.filter(d => d.click_link).length;
  const linkRate = iniciaramVideo > 0 ? ((foramProLink / iniciaramVideo) * 100).toFixed(1) : "0.0";

  // Marcos (Engajamento)
  const milestoneData = [25, 50, 75, 95, 100].map(pct => {
    const usuarios = data.filter(d => Number(d.max_percentage_viewed || 0) >= pct).length;
    const rate = plays > 0 ? ((usuarios / plays) * 100).toFixed(1) : "0.0";
    return { name: `VIRAM ${pct}%`, usuarios, rate };
  });

  // Gráfico de Retenção
  const chartData = Array.from({ length: 101 }, (_, index) => ({
    percentage: index,
    users: playsData.filter(row => Number(row.exact_percentage_viewed || 0) >= index).length
  }));

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Roblox Analytics </h1>
          <p>Métricas reais de engajamento e conversão da Landing Page.</p>
        </div>
        <div className={styles.controlsArea}>
          <div className={styles.inputGroup}>
            <label>Período de Análise</label>
            <CustomDatePicker onRangeChange={handleRangeChange} />
          </div>
        </div>
      </header>

      {/* FILEIRA 1: Visão Geral */}
      <h2 className={styles.sectionHeader}>VISÃO GERAL</h2>
      <div className={styles.kpiGrid}>
        <KpiCard
          title="USUÁRIOS ÚNICOS"
          value={uniqueUsers.toLocaleString('pt-BR')}
          subtitle="Baseado em visitor_id"
          icon={Users}
          color="#a855f7"
        />
        <KpiCard
          title="PAGE VIEWS (TOTAL)"
          value={totalViews.toLocaleString('pt-BR')}
          subtitle="Soma de visualizações da página"
          icon={Eye}
          color="#3b82f6"
        />
        <KpiCard
          title="TEMPO MÉDIO DE VISUALIZ."
          value={`${avgTime}%`}
          subtitle="Média apenas de quem deu play"
          icon={Clock}
          color="#10b981"
        />
      </div>

      {/* FILEIRA 2: Funil */}
      <h2 className={styles.sectionHeader}>FUNIL DE CONVERSÃO</h2>
      <div className={styles.kpiGrid}>
        <KpiCard
          title="INICIARAM O VÍDEO"
          value={iniciaramVideo.toLocaleString('pt-BR')}
          subtitle={`${iniciaramVideoRate}% dos acessos únicos`}
          icon={PlayCircle}
          color="#22c55e"
        />
        <KpiCard
          title="CLICARAM NA ESPERA"
          value={totalCliquesEspera.toLocaleString('pt-BR')}
          subtitle={`${esperaRate}% de quem deu play clicou`}
          icon={AlertTriangle}
          color="#ef4444"
        />
        <KpiCard
          title="FORAM PRO LINK"
          value={foramProLink.toLocaleString('pt-BR')}
          subtitle={`${linkRate}% de quem deu play`}
          icon={MousePointerClick}
          color="#f59e0b"
        />
      </div>

      {/* FILEIRA 3: Engajamento no Vídeo */}
      <h2 className={styles.sectionHeader}>ENGAJAMENTO NO VÍDEO</h2>
      <div className={styles.milestoneGrid}>
        <div className={styles.milestoneCard}>
          <div className={styles.milestoneTitle}>TOTAL DE PLAYS</div>
          <div className={styles.milestoneValue}>{plays}</div>
          <div className={styles.milestoneRate}>
            {iniciaramVideoRate}% dos únicos
          </div>
        </div>
        {milestoneData.map((item, index) => (
          <div key={index} className={styles.milestoneCard}>
            <div className={styles.milestoneTitle}>{item.name}</div>
            <div className={styles.milestoneValue}>{item.usuarios}</div>
            <div className={styles.milestoneRate}>
              {item.rate}% dos plays
            </div>
          </div>
        ))}
      </div>

      {/* FILEIRA 4: Gráfico */}
      <div className={styles.mainGrid}>
        <div className={styles.chartCard}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <BarChart2 size={20} color="#a855f7" />
              Retenção do Vídeo — apenas quem deu play (0 a 100%)
            </div>
          </div>
          <div className={styles.chartWrapper} style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2a2a35" />
                  <XAxis dataKey="percentage" stroke="#8b8b93" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} minTickGap={30} />
                  <YAxis stroke="#8b8b93" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#16161b', borderColor: '#2a2a35', color: '#fff', borderRadius: '8px' }}
                    itemStyle={{ color: '#00e5ff', fontWeight: 'bold' }}
                    labelStyle={{ color: '#8b8b93', marginBottom: '4px' }}
                    formatter={(value: any) => [`${value} espectadores`, 'Audiência']}
                    labelFormatter={(label) => `Chegaram em ${label}% do vídeo`}
                  />
                  <Area type="monotone" dataKey="users" stroke="#a855f7" strokeWidth={3} fillOpacity={1} fill="url(#colorUsers)" activeDot={{ r: 6, fill: "#fff", stroke: "#a855f7", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}