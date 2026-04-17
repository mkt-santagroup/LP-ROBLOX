import React from 'react';

interface ChartProps {
  data: { name: string; usuarios: number }[];
}

export const RetentionChart = ({ data }: ChartProps) => {
  // Pega o valor máximo para calcular a altura das barras
  const maxVal = Math.max(...data.map(d => d.usuarios), 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '15px', height: '300px', padding: '20px 0 0 0', borderBottom: '2px solid #edf2f7' }}>
      {data.map((item, index) => {
        const heightPct = (item.usuarios / maxVal) * 100;
        const isLast = index === data.length - 1;

        return (
          <div key={item.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            {/* Número no topo da barra */}
            <span style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>
              {item.usuarios}
            </span>
            
            {/* Barra */}
            <div style={{
              width: '100%',
              maxWidth: '60px',
              height: `${heightPct}%`,
              minHeight: '5px',
              backgroundColor: isLast ? '#5865F2' : '#3f3f46',
              borderRadius: '6px 6px 0 0',
              transition: 'height 0.3s ease'
            }}></div>
            
            {/* Label de Porcentagem */}
            <span style={{ fontSize: '12px', color: '#4a5568', marginTop: '10px' }}>
              {item.name}
            </span>
          </div>
        );
      })}
    </div>
  );
};