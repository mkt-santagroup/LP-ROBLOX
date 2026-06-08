import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
import InfluencerManager from './pages/AdminDashboard/InfluencerManager';
import AdminGate from './pages/AdminDashboard/AdminGate';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Rota principal: Sua Landing Page Intacta */}
        <Route path="/" element={<LandingPage />} />

        {/* Rota do Admin: O Dashboard de Métricas (protegido por senha) */}
        <Route path="/admin" element={<AdminGate><AdminDashboard /></AdminGate>} />

        {/* Gestão de Influenciadores (protegido por senha) */}
        <Route path="/admin/influenciadores" element={<AdminGate><InfluencerManager /></AdminGate>} />

        {/* Rotas de origem: /influenciador e /influenciador/rede-social
            Renderizam a mesma LP, mas capturam de onde veio o tráfego.
            Ex: /joaozinho/instagram */}
        <Route path="/:influencer" element={<LandingPage />} />
        <Route path="/:influencer/:social" element={<LandingPage />} />
      </Routes>
    </Router>
  );
}