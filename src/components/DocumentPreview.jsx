import { useEffect } from 'react'

function DocumentPreview({ preview, onClose }) {
  useEffect(() => {
    if (!preview) return undefined
    function onKeyDown(event) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      URL.revokeObjectURL(preview.url)
    }
  }, [preview, onClose])

  if (!preview) return null
  const isPdf = preview.type === 'application/pdf'
  const isImage = preview.type.startsWith('image/')
  const isText = preview.type === 'text/plain'
  function download() {
    const link = document.createElement('a')
    link.href = preview.url
    link.download = preview.name
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return <div className="modal-backdrop document-preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="document-preview" role="dialog" aria-modal="true" aria-label={`Preview ${preview.name}`}>
      <header className="document-preview-header"><div><span>DOCUMENT PREVIEW</span><h2>{preview.name}</h2></div><div className="document-preview-actions"><button type="button" className="cancel-button" onClick={download}>Download</button><button type="button" className="modal-close" onClick={onClose} aria-label="Close preview">×</button></div></header>
      <div className="document-preview-body">{isPdf || isText ? <iframe title={preview.name} src={preview.url} /> : isImage ? <img src={preview.url} alt={preview.name} /> : <div className="document-preview-unavailable"><strong>Preview is not available for this file type.</strong><p>Download the document to open it in a compatible app.</p><button type="button" className="add-investor-button" onClick={download}>Download document</button></div>}</div>
    </section>
  </div>
}

export default DocumentPreview
