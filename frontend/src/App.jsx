import { Routes, Route, Navigate } from 'react-router-dom';

// Import pages
import Import from './pages/Import';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Settings from './pages/Settings';
import Configuration from './pages/Configuration';
import CallHistory from './pages/CallHistory';
import CallQueue from './pages/CallQueue';
import LiveMonitor from './pages/LiveMonitor';
import QualifiedLeads from './pages/QualifiedLeads';

// Import components
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';




const NotFound = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
      <p className="text-gray-600 mb-4">Page not found</p>
      <a href="/dashboard" className="text-blue-600 hover:text-blue-800">
        Return to Dashboard
      </a>
    </div>
  </div>
);

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected routes with Layout */}
      <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
      <Route path="/leads" element={<ProtectedRoute><Layout><Leads /></Layout></ProtectedRoute>} />
      <Route path="/leads/:id" element={<ProtectedRoute><Layout><Leads /></Layout></ProtectedRoute>} />
      <Route path="/import" element={<ProtectedRoute><Layout><Import /></Layout></ProtectedRoute>} />
      <Route path="/queue" element={<ProtectedRoute><Layout><CallQueue /></Layout></ProtectedRoute>} />
      <Route path="/monitor" element={<ProtectedRoute><Layout><LiveMonitor /></Layout></ProtectedRoute>} />
      <Route path="/calls" element={<ProtectedRoute><Layout><CallHistory /></Layout></ProtectedRoute>} />
      <Route path="/calls/:id" element={<ProtectedRoute><Layout><CallHistory /></Layout></ProtectedRoute>} />
      <Route path="/qualified-leads" element={<ProtectedRoute><Layout><QualifiedLeads /></Layout></ProtectedRoute>} />
      <Route path="/config" element={<ProtectedRoute><Layout><Configuration /></Layout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />

      {/* Redirects */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
