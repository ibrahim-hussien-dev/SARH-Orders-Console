import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { OrdersPage } from './orders/OrdersPage';

function Screen() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <p className="page-message" role="status">
        Loading…
      </p>
    );
  }
  if (status === 'unauthenticated' || user === null) {
    return <LoginPage />;
  }
  return <OrdersPage key={user.id} />;
}

export function App() {
  return (
    <AuthProvider>
      <Screen />
    </AuthProvider>
  );
}
