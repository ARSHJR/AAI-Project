import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import TicketQueue from "./pages/TicketQueue";
import TicketDetail from "./pages/TicketDetail";
import Escalations from "./pages/Escalations";
import Policies from "./pages/Policies";
import AuditHistory from "./pages/AuditHistory";
import Simulate from "./pages/Simulate";

function RequireAuth({ children }) {
  const { staff } = useAuth();
  if (!staff) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Overview />} />
            <Route path="tickets" element={<TicketQueue />} />
            <Route path="tickets/:id" element={<TicketDetail />} />
            <Route path="escalations" element={<Escalations />} />
            <Route path="policies" element={<Policies />} />
            <Route path="audit" element={<AuditHistory />} />
            <Route path="simulate" element={<Simulate />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
