import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './pages/Home';
import ImportPage from './pages/Import';
import ColumnMapPage from './pages/ColumnMap';
import StatusBoardPage from './pages/StatusBoard';
import ScannerPage from './pages/Scanner';
import UnchartedPage from './pages/Uncharted';
import SettingsPage from './pages/Settings';
import TemplatesPage from './pages/Templates';
import TemplateEditorPage from './pages/TemplateEditor';

// HashRouter is used so the same URL works locally, on GitHub Pages
// (where /Spool-Check-App/path/to/foo would otherwise 404 on a refresh),
// and inside the installed PWA.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/import/map" element={<ColumnMapPage />} />
        <Route path="/board/:deliveryId" element={<StatusBoardPage />} />
        <Route path="/scan/:deliveryId" element={<ScannerPage />} />
        <Route path="/uncharted/:deliveryId" element={<UnchartedPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/:templateId" element={<TemplateEditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
