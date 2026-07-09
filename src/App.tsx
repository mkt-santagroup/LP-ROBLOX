import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import AdminLayout from './pages/AdminDashboard/AdminLayout';
import AdminDashboard from './pages/AdminDashboard/AdminDashboard';
import InfluencerManager from './pages/AdminDashboard/InfluencerManager';
import AnunciosDashboard from './pages/AdminDashboard/AnunciosDashboard';
import AdminGate from './pages/AdminDashboard/AdminGate';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Rota principal: Sua Landing Page Intacta */}
        <Route path="/" element={<LandingPage />} />

        {/* Área Admin (protegida por senha) com navbar retrátil compartilhada:
            Dashboard (index) · Influencers · Anúncios */}
        <Route path="/admin" element={<AdminGate><AdminLayout /></AdminGate>}>
          <Route index element={<AdminDashboard />} />
          <Route path="influenciadores" element={<InfluencerManager />} />
          <Route path="anuncios" element={<AnunciosDashboard />} />
        </Route>

        {/* Rotas de origem: /influenciador e /influenciador/rede-social
            Renderizam a mesma LP, mas capturam de onde veio o tráfego.
            Ex: /joaozinho/instagram */}
        <Route path="/:influencer" element={<LandingPage />} />
        <Route path="/:influencer/:social" element={<LandingPage />} />
      </Routes>
    </Router>
  );
}