import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (mounted) {
        setSession(currentSession)
        setLoading(false)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (loading) return <main className="loading-screen" aria-label="Loading"><span className="loader" /></main>
  if (session) return <DashboardPage onSignOut={() => supabase.auth.signOut()} />
  return <LoginPage />
}

export default App
