import { useState } from 'react'
import { supabase } from '../supabase'
import BrandMark from '../components/BrandMark'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(signInError.message)
    setSubmitting(false)
  }

  return (
    <main className="login-page">
      <section className="visual-panel" aria-label="Construction and logistics">
        <div className="visual-grid" />
        <h1>Construction<br />and Logistics</h1>
      </section>
      <section className="form-panel">
        <div className="form-wrap">
          <div className="mobile-brand brand"><BrandMark /><span>ASMA AFGHAN</span></div>
          <div className="form-heading">
            <p className="form-kicker">YOUR OPERATIONS, IN ONE PLACE</p>
            <h2>Welcome back</h2>
            <p className="form-subtitle">Sign in to continue to your workspace.</p>
          </div>
          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Work email</label>
            <div className="input-wrap">
              <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4" width="15" height="12" rx="2" /><path d="m3.5 5 6.5 5 6.5-5" /></svg>
              <input id="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="password-label"><label htmlFor="password">Password</label></div>
            <div className="input-wrap">
              <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3.5" y="8" width="13" height="9" rx="2" /><path d="M6.5 8V5.5a3.5 3.5 0 0 1 7 0V8M10 11.5v2" /></svg>
              <input id="password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            {error && <p className="error-message" role="alert">{error}</p>}
            <button className="submit-button" type="submit" disabled={submitting}>
              <span>{submitting ? 'Signing in…' : 'Sign in to your account'}</span>
              {!submitting && <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M10 4l6 6-6 6" /></svg>}
            </button>
          </form>
          <p className="secure-note"><svg viewBox="0 0 18 18" aria-hidden="true"><rect x="3.5" y="7.5" width="11" height="8" rx="1.5" /><path d="M6 7.5V5a3 3 0 0 1 6 0v2.5" /></svg> Secure access for authorized team members</p>
        </div>
        <footer className="form-footer"><span>© 2026 Asma Afghan</span><span>BUILT FOR THE LONG HAUL</span></footer>
      </section>
    </main>
  )
}

export default LoginPage
