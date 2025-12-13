import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { Layout } from './components/layout/Layout'
import { SuspendedPage } from './pages/SuspendedPage'
import { DashboardPage } from './pages/DashboardPage'
import { SearchPage } from './pages/SearchPage'
import { CollectionPage } from './pages/CollectionPage'
import { DecksPage } from './pages/DecksPage'
import { ScansPage } from './pages/ScansPage'
import { AdminPage } from './pages/AdminPage'
import { SettingsPage } from './pages/SettingsPage'

/**
 * Callback page for OIDC redirect.
 * The AuthProvider's onSigninCallback handles the token exchange,
 * this just shows a loading state while that happens.
 */
function AuthCallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Completing login...</p>
      </div>
    </div>
  )
}

/**
 * Unauthorized page for access denied.
 */
function UnauthorizedPage() {
  const { logout } = useAuth()

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center max-w-md p-8">
        <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
        <p className="text-muted-foreground mb-6">
          You don't have permission to access this page. Please contact an administrator if you believe this is an error.
        </p>
        <button
          onClick={() => logout()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, login } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // Trigger OIDC login redirect
    login()
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Redirecting to login...</div>
      </div>
    )
  }

  return <>{children}</>
}

function App() {
  return (
    <Routes>
      {/* OIDC Callback route */}
      <Route path="/callback" element={<AuthCallback />} />

      {/* Access denied route */}
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* Suspended account route */}
      <Route path="/suspended" element={<SuspendedPage />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="collection" element={<CollectionPage />} />
        <Route path="decks" element={<DecksPage />} />
        <Route path="scans" element={<ScansPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
