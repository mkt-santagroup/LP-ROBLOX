import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import AdminDashboard from './pages/AdminDashboard/AdminDashboard';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Rota principal: Sua Landing Page Intacta */}
        <Route path="/" element={<LandingPage />} />
        
        {/* Rota do Admin: O Dashboard de Métricas */}
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}