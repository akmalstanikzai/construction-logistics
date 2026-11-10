import BrandMark from './BrandMark'

function Sidebar({ onSignOut, page, onNavigate }) {
  return (
    <aside className="dashboard-sidebar">
      <div className="dashboard-brand brand">
        <BrandMark />
        <span>ASMA AFGHAN</span>
      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        <a className={`sidebar-link ${page === 'investors' ? 'active' : ''}`} href="#investors" aria-current={page === 'investors' ? 'page' : undefined} onClick={(event) => { event.preventDefault(); onNavigate('investors') }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5V8.7L12 4l8 4.7v10.8M8.5 19.5v-6h7v6M2.8 9.2 12 3.8l9.2 5.4" /></svg>
          <span>Investors</span>
        </a>
        <a className={`sidebar-link ${page === 'projects' ? 'active' : ''}`} href="#projects" aria-current={page === 'projects' ? 'page' : undefined} onClick={(event) => { event.preventDefault(); onNavigate('projects') }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v13H3zM7 7V4h10v3M7 12h10M7 16h7" /></svg>
          <span>Projects</span>
        </a>
      </nav>
      <button className="sidebar-sign-out" onClick={onSignOut}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3m9-8h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7" /></svg>
        <span>Sign out</span>
      </button>
    </aside>
  )
}

export default Sidebar
