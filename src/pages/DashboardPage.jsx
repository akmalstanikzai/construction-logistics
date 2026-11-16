import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'
import InvestorsPage from './InvestorsPage'
import ProjectsPage from './ProjectsPage'
import ExpensesPage from './ExpensesPage'

function DashboardPage({ onSignOut }) {
  const [page, setPage] = useState(['projects', 'expenses'].includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'investors')
  useEffect(() => {
    const syncPage = () => setPage(['projects', 'expenses'].includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'investors')
    window.addEventListener('hashchange', syncPage)
    return () => window.removeEventListener('hashchange', syncPage)
  }, [])
  function navigate(nextPage) {
    window.location.hash = nextPage
    setPage(nextPage)
  }
  return (
    <main className="dashboard-layout">
      <Sidebar onSignOut={onSignOut} page={page} onNavigate={navigate} />
      <div className="dashboard-content">
        {page === 'projects' ? <ProjectsPage /> : page === 'expenses' ? <ExpensesPage /> : <InvestorsPage />}
      </div>
    </main>
  )
}

export default DashboardPage
