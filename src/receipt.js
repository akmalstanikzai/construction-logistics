function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}

function receiptCanvas(investor, investment) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 1500
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 1200, 1500)
  ctx.fillStyle = '#173d63'
  ctx.fillRect(0, 0, 1200, 215)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 48px Arial'
  ctx.fillText('ASMA AFGHAN', 90, 105)
  ctx.font = '26px Arial'
  ctx.fillText(investment.kind === 'withdrawal' ? 'INVESTMENT WITHDRAWAL RECEIPT' : 'INVESTMENT RECEIPT', 90, 155)
  ctx.fillStyle = '#173d63'
  ctx.font = 'bold 42px Arial'
  ctx.fillText(investment.kind === 'withdrawal' ? 'Investment withdrawn' : 'Investment received', 90, 310)
  const rows = [
    ['Receipt ID', investment.id],
    ['Investor', `${investor.first_name} ${investor.last_name}`],
    [investment.kind === 'withdrawal' ? 'Withdrawal date' : 'Investment date', investment.investment_date],
    [investment.kind === 'withdrawal' ? 'Amount taken' : 'Amount received', Number(investment.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
  ]
  let y = 410
  for (const [label, value] of rows) {
    ctx.fillStyle = '#7890a5'
    ctx.font = '24px Arial'
    ctx.fillText(label, 90, y)
    ctx.fillStyle = '#173d63'
    ctx.font = 'bold 29px Arial'
    ctx.fillText(value, 90, y + 44, 1020)
    y += 145
  }
  ctx.fillStyle = '#7890a5'
  ctx.font = '24px Arial'
  ctx.fillText('Note', 90, y)
  ctx.fillStyle = '#173d63'
  ctx.font = '27px Arial'
  const words = (investment.note || '—').split(/\s+/)
  let line = ''
  y += 45
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > 1000 && line) {
      ctx.fillText(line, 90, y)
      y += 40
      line = word
    } else line = next
  }
  ctx.fillText(line, 90, y)
  ctx.strokeStyle = '#dbe6ef'
  ctx.beginPath()
  ctx.moveTo(90, 1340)
  ctx.lineTo(1110, 1340)
  ctx.stroke()
  ctx.fillStyle = '#7890a5'
  ctx.font = '21px Arial'
  ctx.fillText('Generated from the investor register', 90, 1390)
  return canvas
}

export async function downloadReceipt(investor, investment, format = 'pdf') {
  const canvas = receiptCanvas(investor, investment)
  const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.94))
  if (!jpeg) throw new Error('Could not create receipt image.')
  const name = `investment-${investment.investment_date}-${investment.id.slice(0, 8)}`
  if (format === 'jpg') {
    download(jpeg, `${name}.jpg`)
    return
  }
  download(await canvasesToPdf([canvas]), `${name}.pdf`)
}

async function canvasesToPdf(canvases) {
  const images = await Promise.all(canvases.map(async (canvas) => {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.94))
    if (!blob) throw new Error('Could not create report PDF.')
    return new Uint8Array(await blob.arrayBuffer())
  }))
  const encoder = new TextEncoder()
  const chunks = []
  let length = 0
  const add = (value) => {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value
    chunks.push(bytes)
    length += bytes.length
  }
  const offsets = [0]
  add('%PDF-1.4\n')
  const object = (id, body) => { offsets[id] = length; add(`${id} 0 obj\n${body}\nendobj\n`) }
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  const pageIds = images.map((_, index) => 3 + index * 3)
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)
  images.forEach((image, index) => {
    const pageId = pageIds[index]
    const imageId = pageId + 1
    const contentId = pageId + 2
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 750] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)
    offsets[imageId] = length
    add(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width 1200 /Height 1500 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`)
    add(image)
    add('\nendstream\nendobj\n')
    const content = 'q 600 0 0 750 0 0 cm /Im0 Do Q'
    object(contentId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  })
  const xref = length
  const count = 3 + images.length * 3
  add(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let id = 1; id < count; id++) add(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  add(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob(chunks, { type: 'application/pdf' })
}

function reportPages(investor) {
  const pages = []
  let ctx
  let y
  const nextPage = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 1500
    ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 1200, 1500)
    ctx.fillStyle = '#173d63'
    ctx.fillRect(0, 0, 1200, 180)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 42px Arial'
    ctx.fillText('ASMA AFGHAN', 75, 80)
    ctx.font = '24px Arial'
    ctx.fillText('INVESTOR REPORT', 75, 130)
    y = 235
    pages.push(canvas)
  }
  const line = (value, font = '25px Arial', color = '#294966', indent = 75) => {
    if (y > 1340) nextPage()
    ctx.font = font
    ctx.fillStyle = color
    ctx.fillText(value, indent, y, 1050 - (indent - 75))
    y += 39
  }
  const wrapped = (label, value) => {
    line(label, 'bold 24px Arial', '#7890a5')
    ctx.font = '25px Arial'
    let current = ''
    for (const word of String(value || '—').split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word
      if (ctx.measureText(candidate).width > 1000 && current) {
        line(current)
        current = word
      } else current = candidate
    }
    line(current || '—')
    y += 20
  }
  const amount = (value) => Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const added = investor.investments.reduce((sum, item) => sum + (item.kind === 'withdrawal' ? 0 : Number(item.amount)), 0)
  const withdrawn = investor.investments.reduce((sum, item) => sum + (item.kind === 'withdrawal' ? Number(item.amount) : 0), 0)
  nextPage()
  line(`${investor.first_name} ${investor.last_name}`, 'bold 39px Arial', '#173d63')
  y += 15
  wrapped('Investor contact numbers', investor.contacts.filter((item) => item.contact_type === 'investor').map((item) => item.phone_number).join(', '))
  wrapped('Inheritor', investor.inheritor_name)
  wrapped('Inheritor contact numbers', investor.contacts.filter((item) => item.contact_type === 'inheritor').map((item) => item.phone_number).join(', '))
  wrapped('NID document', investor.nic_r2_key ? 'Attached separately' : 'Not attached')
  wrapped('Current investment balance', amount(added - withdrawn))
  wrapped('Total added', amount(added))
  wrapped('Total withdrawn', amount(withdrawn))
  line('Transaction history', 'bold 32px Arial', '#173d63')
  y += 8
  if (!investor.investments.length) line('No transactions recorded.', '25px Arial', '#7890a5')
  for (const item of investor.investments) {
    if (y > 1200) nextPage()
    line(`${item.kind === 'withdrawal' ? 'Withdrawal' : 'Investment added'}  |  ${item.investment_date}  |  ${amount(item.amount)}`, 'bold 26px Arial')
    line(`Receipt ID: ${item.id}`, '20px Arial', '#7890a5')
    wrapped('Note', item.note || '—')
    y += 22
  }
  pages.forEach((canvas, index) => {
    const footer = canvas.getContext('2d')
    footer.fillStyle = '#7890a5'
    footer.font = '20px Arial'
    footer.fillText(`Generated ${new Date().toLocaleDateString('en-CA')}  •  Page ${index + 1} of ${pages.length}`, 75, 1430)
  })
  return pages
}

export async function downloadInvestorReport(investor) {
  const pdf = await canvasesToPdf(reportPages(investor))
  const name = `${investor.first_name}-${investor.last_name}-investment-report.pdf`.replace(/[^a-z0-9.-]+/gi, '-')
  download(pdf, name)
}
