import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, homeFor } from './AuthContext.jsx';
import Login from './pages/Login.jsx';
import DeptDashboard from './pages/DeptDashboard.jsx';
import DprEntry from './pages/DprEntry.jsx';
import UnitDashboard from './pages/UnitDashboard.jsx';
import UprReview from './pages/UprReview.jsx';
import UprSend from './pages/UprSend.jsx';
import UprView from './pages/UprView.jsx';
import UnitReports from './pages/UnitReports.jsx';
import Analytics from './pages/Analytics.jsx';
import ReportsHub from './pages/ReportsHub.jsx';
import AdminOverview from './pages/AdminOverview.jsx';
import AdminUnits from './pages/AdminUnits.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminMaster from './pages/AdminMaster.jsx';
import AdminImport from './pages/AdminImport.jsx';
import History from './pages/History.jsx';
import PurchasePortal from './pages/PurchasePortal.jsx';
import ChangePassword from './pages/ChangePassword.jsx';

function Protected({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}

export default function App() {
  const { user, ssoChecking } = useAuth();
  // Portal sign-on in progress (only when VITE_AUTH_URL is set): hold the
  // routes back so the login page does not flash before the session arrives.
  if (ssoChecking) {
    return <div className="min-h-screen grid place-items-center text-ink-faint">Signing in…</div>;
  }
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homeFor(user)} replace /> : <Login />} />

      <Route path="/dept" element={<Protected roles={['dept_head']}><DeptDashboard /></Protected>} />
      <Route path="/dept/dpr/:id" element={<Protected roles={['dept_head', 'unit_head', 'admin']}><DprEntry /></Protected>} />

      <Route path="/unit" element={<Protected roles={['unit_head']}><UnitDashboard /></Protected>} />
      <Route path="/unit/upr" element={<Protected roles={['unit_head']}><UprReview /></Protected>} />
      <Route path="/unit/upr/:id/send" element={<Protected roles={['unit_head']}><UprSend /></Protected>} />
      <Route path="/unit/reports" element={<Protected roles={['unit_head']}><UnitReports /></Protected>} />
      <Route path="/upr/:id" element={<Protected roles={['admin', 'unit_head', 'purchase_head']}><UprView /></Protected>} />

      <Route path="/analytics" element={<Protected roles={['admin', 'unit_head', 'purchase_head']}><Analytics /></Protected>} />
      <Route path="/reports" element={<Protected roles={['admin', 'unit_head']}><ReportsHub /></Protected>} />

      <Route path="/admin" element={<Protected roles={['admin']}><AdminOverview /></Protected>} />
      <Route path="/admin/units" element={<Protected roles={['admin']}><AdminUnits /></Protected>} />
      <Route path="/admin/users" element={<Protected roles={['admin']}><AdminUsers /></Protected>} />
      <Route path="/admin/master" element={<Protected roles={['admin']}><AdminMaster /></Protected>} />
      <Route path="/admin/import" element={<Protected roles={['admin']}><AdminImport /></Protected>} />

      <Route path="/purchase" element={<Protected roles={['purchase_head']}><PurchasePortal /></Protected>} />
      <Route path="/history" element={<Protected roles={['admin', 'unit_head', 'dept_head']}><History /></Protected>} />
      <Route path="/change-password" element={<Protected><ChangePassword /></Protected>} />

      <Route path="*" element={<Navigate to={homeFor(user)} replace />} />
    </Routes>
  );
}
