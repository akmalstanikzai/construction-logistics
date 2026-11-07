import Sidebar from '../components/Sidebar'
import InvestorsPage from './InvestorsPage'

function DashboardPage({ onSignOut }) {
  return (
    <main className="dashboard-layout">
      <Sidebar onSignOut={onSignOut} />
      <div className="dashboard-content">
        <InvestorsPage />
      </div>
    </main>
  )
}

export default DashboardPage
