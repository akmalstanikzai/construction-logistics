import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const emptyForm = {
  firstName: '',
  lastName: '',
  contactNumbers: [''],
  inheritorName: '',
  inheritorContactNumbers: [''],
  nicFile: null,
}

function phoneList(contacts, type) {
  return contacts.filter((contact) => contact.contact_type === type).map((contact) => contact.phone_number)
}

function displayPhones(phones) {
  return phones.length ? phones.join(', ') : '—'
}

function InvestorsPage() {
  const [investors, setInvestors] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [downloadingId, setDownloadingId] = useState('')
  const [uploadingId, setUploadingId] = useState('')
  const workerUrl = import.meta.env.VITE_R2_WORKER_URL?.replace(/\/$/, '')

  const loadInvestors = useCallback(async () => {
    const { data: investorRows, error: investorError } = await supabase
      .from('investors')
      .select('id, first_name, last_name, inheritor_name, nic_r2_key, created_at')
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
    if (investorError) {
      setLoadError(investorError.message)
      setLoading(false)
      return
    }
    setLoadError('')
    if (investorRows.length === 0) {
      setInvestors([])
      setLoading(false)
      return
    }
    const { data: contacts, error: contactsError } = await supabase
      .from('investor_contacts')
      .select('id, investor_id, contact_type, phone_number')
      .in('investor_id', investorRows.map((investor) => investor.id))
      .order('created_at', { ascending: true })
    if (contactsError) {
      setLoadError(contactsError.message)
      setLoading(false)
      return
    }
    const contactsByInvestor = new Map()
    for (const contact of contacts) {
      const list = contactsByInvestor.get(contact.investor_id) ?? []
      list.push(contact)
      contactsByInvestor.set(contact.investor_id, list)
    }
    setInvestors(investorRows.map((investor) => ({
      ...investor,
      contacts: contactsByInvestor.get(investor.id) ?? [],
    })))
    setLoading(false)
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Load data from Supabase when the page mounts.
    loadInvestors()
  }, [loadInvestors])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updatePhone(field, index, value) {
    setForm((current) => ({
      ...current,
      [field]: current[field].map((phone, phoneIndex) => phoneIndex === index ? value : phone),
    }))
  }

  function addPhone(field) {
    setForm((current) => ({ ...current, [field]: [...current[field], ''] }))
  }

  function removePhone(field, index) {
    setForm((current) => ({ ...current, [field]: current[field].filter((_, phoneIndex) => phoneIndex !== index) }))
  }

  async function uploadNicFile(investorId, file) {
    if (!workerUrl) throw new Error('The R2 Worker URL is not configured.')
    if (file.size > 10 * 1024 * 1024) throw new Error('PDF must be 10 MB or smaller.')
    const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer())
    if (signature !== '%PDF-') throw new Error('Choose a valid PDF file.')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Your session expired. Sign in again.')

    const body = new FormData()
    body.append('file', file)
    let response
    try {
      response = await fetch(`${workerUrl}/investors/${investorId}/nic`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body,
      })
    } catch {
      throw new Error('Could not reach the R2 Worker. Check its URL and allowed origins.')
    }
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || `NIC PDF upload failed (HTTP ${response.status}).`)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    setNotice('')
    if (!workerUrl && form.nicFile) {
      setFormError('Set VITE_R2_WORKER_URL to enable NIC PDF uploads.')
      setSaving(false)
      return
    }
    if (form.nicFile) {
      const signature = new TextDecoder().decode(await form.nicFile.slice(0, 5).arrayBuffer())
      if (signature !== '%PDF-') {
        setFormError('Choose a valid PDF file.')
        setSaving(false)
        return
      }
    }

    const { data: investorId, error: createError } = await supabase.rpc('create_investor', {
      p_first_name: form.firstName.trim(),
      p_last_name: form.lastName.trim(),
      p_contact_numbers: form.contactNumbers.map((phone) => phone.trim()).filter(Boolean),
      p_inheritor_name: form.inheritorName.trim(),
      p_inheritor_contact_numbers: form.inheritorContactNumbers.map((phone) => phone.trim()).filter(Boolean),
    })
    if (createError) {
      setFormError(createError.message)
      setSaving(false)
      return
    }

    let uploadError = null
    if (form.nicFile) {
      try {
        await uploadNicFile(investorId, form.nicFile)
      } catch (error) {
        uploadError = error
      }
    }
    setForm(emptyForm)
    setModalOpen(false)
    await loadInvestors()
    setSaving(false)
    if (uploadError) {
      setLoadError(`Investor saved without the NIC PDF: ${uploadError.message} Use Attach NIC to try again.`)
    } else {
      setNotice('Investor added successfully.')
    }
  }

  async function attachNic(investor, event) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    setUploadingId(investor.id)
    setLoadError('')
    setNotice('')
    try {
      await uploadNicFile(investor.id, file)
      await loadInvestors()
      setNotice('NIC PDF attached successfully.')
    } catch (error) {
      setLoadError(`NIC PDF upload failed: ${error.message}`)
    } finally {
      input.value = ''
      setUploadingId('')
    }
  }

  async function downloadNic(investor) {
    if (!workerUrl) {
      setLoadError('Set VITE_R2_WORKER_URL to enable NIC PDF downloads.')
      return
    }
    setDownloadingId(investor.id)
    setLoadError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Your session expired. Sign in again.')
      const response = await fetch(`${workerUrl}/investors/${investor.id}/nic`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Could not download the NIC PDF')
      }
      const blobUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `${investor.first_name}-${investor.last_name}-NIC.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch (error) {
      setLoadError(error.message)
    } finally {
      setDownloadingId('')
    }
  }

  function closeModal() {
    if (!saving) {
      setModalOpen(false)
      setFormError('')
    }
  }

  return (
    <section className="investors-page" aria-label="Investors">
      <header className="investors-header">
        <div>
          <p className="investors-eyebrow">ASMA AFGHAN</p>
          <h1>Investors</h1>
          <p className="investors-subtitle">Investor records and inheritance contacts.</p>
        </div>
        <button className="add-investor-button" onClick={() => { setModalOpen(true); setNotice('') }}>
          <span aria-hidden="true">+</span> Add investor
        </button>
      </header>

      {notice && <div className="investors-notice" role="status">{notice}</div>}
      {loadError && <div className="investors-alert" role="alert">{loadError}</div>}

      <div className="investor-list-heading"><h2>All investors</h2><span>{investors.length} {investors.length === 1 ? 'record' : 'records'}</span></div>
      {loading ? <div className="investors-state"><span className="loader" /></div> : investors.length === 0 ? (
        <div className="investors-empty">
          <div className="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19.5V8.7L12 4l8 4.7v10.8M8.5 19.5v-6h7v6M2.8 9.2 12 3.8l9.2 5.4" /></svg></div>
          <h2>No investors yet</h2>
          <p>Add an investor to start your register.</p>
          <button className="add-investor-button secondary" onClick={() => setModalOpen(true)}>Add first investor</button>
        </div>
      ) : (
        <div className="investor-cards">
          {investors.map((investor) => {
            const investorPhones = phoneList(investor.contacts, 'investor')
            const inheritorPhones = phoneList(investor.contacts, 'inheritor')
            return (
              <article className="investor-card" key={investor.id}>
                <div className="investor-card-top">
                  <div className="investor-avatar" aria-hidden="true">{investor.first_name[0]}{investor.last_name[0]}</div>
                  <div className="investor-name"><h2>{investor.first_name} {investor.last_name}</h2><span>Investor</span></div>
                  {investor.nic_r2_key ? <button className="nic-button" onClick={() => downloadNic(investor)} disabled={downloadingId === investor.id}>
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5v10m0 0 3.5-3.5M10 12.5 6.5 9M3 14v3h14v-3" /></svg>
                    {downloadingId === investor.id ? 'Loading…' : 'NIC PDF'}
                  </button> : <label className="nic-button nic-upload-button">
                    {uploadingId === investor.id ? 'Uploading…' : 'Attach NIC'}
                    <input type="file" accept="application/pdf,.pdf" disabled={uploadingId === investor.id} onChange={(event) => attachNic(investor, event)} />
                  </label>}
                </div>
                <div className="investor-details">
                  <div><span className="detail-label">Contact numbers</span><p>{displayPhones(investorPhones)}</p></div>
                  <div><span className="detail-label">Inheritor</span><p>{investor.inheritor_name}</p></div>
                  <div><span className="detail-label">Inheritor numbers</span><p>{displayPhones(inheritorPhones)}</p></div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {modalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal() }}>
        <section className="investor-modal" role="dialog" aria-modal="true" aria-labelledby="investor-modal-title">
          <header className="modal-header"><div><p className="investors-eyebrow">INVESTOR REGISTER</p><h2 id="investor-modal-title">Add investor</h2></div><button className="modal-close" onClick={closeModal} aria-label="Close" disabled={saving}>×</button></header>
          <form className="investor-form" onSubmit={handleSubmit}>
            <div className="form-section-title">Investor details</div>
            <div className="form-two-col">
              <label>First name<input value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} required autoFocus /></label>
              <label>Last name<input value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} required /></label>
            </div>
            <div className="dynamic-field-group">
              <div className="dynamic-field-heading"><span>Contact numbers</span><button type="button" onClick={() => addPhone('contactNumbers')}>+ Add number</button></div>
              {form.contactNumbers.map((phone, index) => <div className="phone-input-row" key={`investor-phone-${index}`}>
                <input type="tel" value={phone} onChange={(event) => updatePhone('contactNumbers', index, event.target.value)} placeholder="Phone number" required aria-label={`Investor contact number ${index + 1}`} />
                {form.contactNumbers.length > 1 && <button type="button" onClick={() => removePhone('contactNumbers', index)} aria-label={`Remove investor number ${index + 1}`}>×</button>}
              </div>)}
            </div>
            <div className="form-section-title inheritor-section-title">Inheritor details</div>
            <label className="full-label">Inheritor name<input value={form.inheritorName} onChange={(event) => updateField('inheritorName', event.target.value)} required /></label>
            <div className="dynamic-field-group">
              <div className="dynamic-field-heading"><span>Inheritor contact numbers</span><button type="button" onClick={() => addPhone('inheritorContactNumbers')}>+ Add number</button></div>
              {form.inheritorContactNumbers.map((phone, index) => <div className="phone-input-row" key={`inheritor-phone-${index}`}>
                <input type="tel" value={phone} onChange={(event) => updatePhone('inheritorContactNumbers', index, event.target.value)} placeholder="Phone number" required aria-label={`Inheritor contact number ${index + 1}`} />
                {form.inheritorContactNumbers.length > 1 && <button type="button" onClick={() => removePhone('inheritorContactNumbers', index)} aria-label={`Remove inheritor number ${index + 1}`}>×</button>}
              </div>)}
            </div>
            <div className="nic-upload-section">
              <div><span className="form-section-title">NIC document</span><p>Attach a PDF copy of the NIC. Maximum 10 MB.</p></div>
              <label className="file-picker">{form.nicFile ? <span>{form.nicFile.name}</span> : <span>Choose PDF</span>}<input type="file" accept="application/pdf,.pdf" onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                if (file && file.size > 10 * 1024 * 1024) {
                  setFormError('PDF must be 10 MB or smaller.')
                  event.target.value = ''
                  return
                }
                setFormError('')
                updateField('nicFile', file)
              }} /></label>
            </div>
            {formError && <p className="error-message form-error" role="alert">{formError}</p>}
            <footer className="modal-actions"><button type="button" className="cancel-button" onClick={closeModal} disabled={saving}>Cancel</button><button type="submit" className="add-investor-button" disabled={saving}>{saving ? 'Saving…' : 'Save investor'}</button></footer>
          </form>
        </section>
      </div>}
    </section>
  )
}

export default InvestorsPage
