import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'
import InvestorsPage from './InvestorsPage'
import ProjectsPage from './ProjectsPage'

function DashboardPage({ onSignOut }) {
  const [page, setPage] = useState(window.location.hash === '#projects' ? 'projects' : 'investors')
  useEffect(() => {
    const syncPage = () => setPage(window.location.hash === '#projects' ? 'projects' : 'investors')
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
        {page === 'projects' ? <ProjectsPage /> : <InvestorsPage />}
      </div>
    </main>
  )
}

export default DashboardPage
