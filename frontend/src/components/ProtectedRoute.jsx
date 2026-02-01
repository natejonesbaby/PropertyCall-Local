import { Navigate, useLocation } from 'react-router-dom';

/**
 * ProtectedRoute component that checks for authentication
 * Redirects to login if not authenticated, preserving the original URL
 */
const ProtectedRoute = ({ children }) => {
  const location = useLocation();

  // Check if user is authenticated (has token in localStorage)
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');

  if (!token || !user) {
    // Redirect to login, preserving the attempted URL in state
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
};

export default ProtectedRoute;
