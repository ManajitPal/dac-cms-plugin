import { useState, useCallback, useEffect, useRef } from 'react'
import SparkMD5 from 'spark-md5'
import './App.css'

const COLLECTION_ID = '6a2c0e18fcbb49a72b682c64'
const SITE_ID = '6a2186b8ab54feb7056fb382'

const CATEGORIES = [
  { id: '6a2d85fe368bc946179c8406', name: 'Assembly' },
  { id: '6a2d85f5278a501ddaf02c31', name: 'Recreational' },
  { id: '6a2d85eb1ac36d39348c6854', name: 'Medical' },
  { id: '6a2d85e350fbd110a614e7b2', name: 'Institutional' },
  { id: '6a2d85ce11f6e32414627ac9', name: 'Retail' },
  { id: '6a2d85c95a4de301ec80c4ef', name: 'Industrial' },
  { id: '6a2d85c3d2d7b8fbe0bedc4e', name: 'Office' },
  { id: '6a2d8587b79970e94d4cec63', name: 'Residential Interior' },
  { id: '6a2d857a0cc80afc04ef1b23', name: 'Residence' },
  { id: '6a2d85731ac36d39348c50df', name: 'Villa' },
  { id: '6a2d8569bb9b73dc03a1eb14', name: 'Mixed use' },
  { id: '6a2d85616002e4fd2ee95650', name: 'Hospitality' },
  { id: '6a2d8558b7d2374814e69143', name: 'Commercial' },
  { id: '6a2d854e3f9feeabc2e466a4', name: 'Apartment' },
]

const toSlug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function computeMD5(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const spark = new SparkMD5.ArrayBuffer()
      spark.append(e.target!.result as ArrayBuffer)
      resolve(spark.end())
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

async function uploadAsset(file: File): Promise<{ fileId: string; url: string }> {
  const hash = await computeMD5(file)
  const initRes = await fetch(`/api/proxy/v2/sites/${SITE_ID}/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fileHash: hash }),
  })
  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}))
    throw new Error((err as { message?: string }).message ?? `Asset upload init failed (${initRes.status})`)
  }
  const { id, uploadUrl, uploadDetails, hostedUrl } = await initRes.json()
  const form = new FormData()
  for (const [k, v] of Object.entries(uploadDetails as Record<string, string>)) form.append(k, v)
  form.append('file', file)
  const s3Res = await fetch(uploadUrl, { method: 'POST', body: form })
  if (!s3Res.ok && s3Res.status !== 204) throw new Error(`S3 upload failed (${s3Res.status})`)
  return { fileId: id, url: hostedUrl }
}

interface Pair { id: number; label: string; value: string }
let pairCounter = 0
const newPair = (): Pair => ({ id: ++pairCounter, label: '', value: '' })
const serializePairs = (pairs: Pair[]) =>
  pairs.filter(p => p.label.trim() || p.value.trim())
       .map(p => `${p.label.trim()}:${p.value.trim()}`).join('; ')

interface FormData {
  name: string; slug: string; category: string; status: string
  client: string; location: string; area: string
  'project-summary': string; 'project-details': string
  'project-team': Pair[]; 'project-video': string
}
const EMPTY: FormData = {
  name: '', slug: '', category: '', status: '',
  client: '', location: '', area: '',
  'project-summary': '', 'project-details': '',
  'project-team': [newPair()], 'project-video': '',
}

interface FileState { mainImage: File | null; gallery: File[]; projectFile: File | null }
const EMPTY_FILES: FileState = { mainImage: null, gallery: [], projectFile: null }

type SubmitStatus =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string }

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY)
  const [files, setFiles] = useState<FileState>(EMPTY_FILES)
  const [status, setStatus] = useState<SubmitStatus>({ type: 'idle' })
  const galleryInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: { authenticated: boolean }) => setAuthed(d.authenticated))
      .catch(() => setAuthed(false))
  }, [])

  const set = useCallback((field: keyof Omit<FormData, 'project-team'>, value: string) => {
    setForm(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'name' ? { slug: toSlug(value) } : {}),
    }))
  }, [])

  const setPair = useCallback((id: number, key: 'label' | 'value', value: string) => {
    setForm(prev => ({ ...prev, 'project-team': prev['project-team'].map(p => p.id === id ? { ...p, [key]: value } : p) }))
  }, [])
  const addPair = useCallback(() => {
    setForm(prev => ({ ...prev, 'project-team': [...prev['project-team'], newPair()] }))
  }, [])
  const removePair = useCallback((id: number) => {
    setForm(prev => {
      const next = prev['project-team'].filter(p => p.id !== id)
      return { ...prev, 'project-team': next.length ? next : [newPair()] }
    })
  }, [])

  const reset = () => {
    setForm(EMPTY)
    setFiles(EMPTY_FILES)
    setStatus({ type: 'idle' })
    if (galleryInputRef.current) galleryInputRef.current.value = ''
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus({ type: 'loading' })
    try {
      const [mainImageAsset, galleryAssets, projectFileAsset] = await Promise.all([
        files.mainImage ? uploadAsset(files.mainImage) : Promise.resolve(null),
        Promise.all(files.gallery.map(f => uploadAsset(f))),
        files.projectFile ? uploadAsset(files.projectFile) : Promise.resolve(null),
      ])

      const fieldData: Record<string, unknown> = {
        name: form.name,
        slug: form.slug,
        category: form.category,
      }
      const serialized = serializePairs(form['project-team'])
      if (serialized) fieldData['project-team'] = serialized

      const optional = ['status', 'client', 'location', 'area', 'project-summary', 'project-details', 'project-video'] as const
      optional.forEach(k => { if (form[k].trim()) fieldData[k] = form[k].trim() })

      if (mainImageAsset) fieldData['main-project-image'] = { fileId: mainImageAsset.fileId, url: mainImageAsset.url, alt: '' }
      if (galleryAssets.length) fieldData['image-gallery'] = galleryAssets.map(a => ({ fileId: a.fileId, url: a.url, alt: '' }))
      if (projectFileAsset) fieldData['project-file'] = { fileId: projectFileAsset.fileId, url: projectFileAsset.url }

      const res = await fetch(`/api/proxy/v2/collections/${COLLECTION_ID}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldData, isDraft: true }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus({ type: 'success', message: `"${(data as { fieldData: { name: string } }).fieldData.name}" created as draft` })
        reset()
      } else {
        setStatus({ type: 'error', message: (data as { message?: string }).message ?? `Error ${res.status}` })
      }
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Request failed.' })
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (authed === null) {
    return <div className="setup"><span className="setup-logo">DAC</span><p className="setup-desc">Loading…</p></div>
  }

  // ── Sign-in ───────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="setup">
        <span className="setup-logo">DAC</span>
        <h2 className="setup-title">CMS Admin</h2>
        <p className="setup-desc">Sign in with your Webflow account to add projects.</p>
        <a className="btn" href="/api/auth/login">Sign in with Webflow →</a>
      </div>
    )
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <div className="header">
        <span className="logo">DAC</span>
        <span className="header-title">Add Project</span>
        <a className="reset-btn" href="/api/auth/logout" title="Sign out">↩</a>
      </div>

      {status.type === 'success' && (
        <div className="banner banner-success">
          ✓ {status.message}
          <button className="banner-close" onClick={() => setStatus({ type: 'idle' })}>×</button>
        </div>
      )}
      {status.type === 'error' && (
        <div className="banner banner-error">
          {status.message}
          <button className="banner-close" onClick={() => setStatus({ type: 'idle' })}>×</button>
        </div>
      )}

      <form className="form" onSubmit={submit}>
        <section className="section">
          <div className="section-title">Identity</div>
          <Field label="Name *">
            <input className="input" type="text" required value={form.name}
              placeholder="e.g. Harbour Front Residence"
              onChange={e => set('name', e.target.value)} />
          </Field>
          <Field label="Slug *">
            <input className="input" type="text" required value={form.slug}
              placeholder="auto-generated"
              onChange={e => set('slug', e.target.value)} />
          </Field>
          <Field label="Category *">
            <select className="input select" required value={form.category}
              onChange={e => set('category', e.target.value)}>
              <option value="">Select...</option>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <div className="row">
            <Field label="Client">
              <input className="input" type="text" value={form.client} onChange={e => set('client', e.target.value)} />
            </Field>
            <Field label="Status">
              <input className="input" type="text" value={form.status} placeholder="Completed" onChange={e => set('status', e.target.value)} />
            </Field>
          </div>
          <div className="row">
            <Field label="Location">
              <input className="input" type="text" value={form.location} onChange={e => set('location', e.target.value)} />
            </Field>
            <Field label="Area">
              <input className="input" type="text" value={form.area} placeholder="450 sqm" onChange={e => set('area', e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="section">
          <div className="section-title">Content</div>
          <Field label="Project Intro">
            <textarea className="input textarea" rows={3} value={form['project-summary']}
              placeholder="Brief description" onChange={e => set('project-summary', e.target.value)} />
          </Field>
          <Field label="Project Details">
            <textarea className="input textarea" rows={3} value={form['project-details']}
              placeholder="Extended content" onChange={e => set('project-details', e.target.value)} />
          </Field>
          <div className="field">
            <label className="label">Project Team</label>
            <div className="pairs">
              {form['project-team'].map(pair => (
                <div key={pair.id} className="pair-row">
                  <input className="input pair-label" type="text" placeholder="Role"
                    value={pair.label} onChange={e => setPair(pair.id, 'label', e.target.value)} />
                  <span className="pair-sep">:</span>
                  <input className="input pair-value" type="text" placeholder="Name"
                    value={pair.value} onChange={e => setPair(pair.id, 'value', e.target.value)} />
                  <button type="button" className="pair-remove" onClick={() => removePair(pair.id)} tabIndex={-1}>×</button>
                </div>
              ))}
              <button type="button" className="add-pair-btn" onClick={addPair}>+ Add row</button>
            </div>
            {serializePairs(form['project-team']) && (
              <p className="hint preview-hint">→ {serializePairs(form['project-team'])}</p>
            )}
          </div>
        </section>

        <section className="section">
          <div className="section-title">Media</div>
          <Field label="Main Project Image">
            <input className="input input-file" type="file" accept="image/*"
              onChange={e => setFiles(prev => ({ ...prev, mainImage: e.target.files?.[0] ?? null }))} />
            {files.mainImage && (
              <div className="file-preview">
                <img src={URL.createObjectURL(files.mainImage)} className="img-thumb" alt="" />
                <span className="file-name">{files.mainImage.name}</span>
                <button type="button" className="file-remove"
                  onClick={() => setFiles(prev => ({ ...prev, mainImage: null }))}>×</button>
              </div>
            )}
          </Field>
          <Field label="Image Gallery">
            <input className="input input-file" type="file" accept="image/*" multiple
              ref={galleryInputRef}
              onChange={e => { setFiles(prev => ({ ...prev, gallery: [...prev.gallery, ...Array.from(e.target.files ?? [])] })); e.target.value = '' }} />
            {files.gallery.length > 0 && (
              <div className="gallery-thumbs">
                {files.gallery.map((f, i) => (
                  <div key={i} className="gallery-thumb">
                    <img src={URL.createObjectURL(f)} alt="" />
                    <button type="button" className="file-remove thumb-remove"
                      onClick={() => setFiles(prev => ({ ...prev, gallery: prev.gallery.filter((_, j) => j !== i) }))}>×</button>
                  </div>
                ))}
              </div>
            )}
          </Field>
          <Field label="Project File">
            <input className="input input-file" type="file"
              onChange={e => setFiles(prev => ({ ...prev, projectFile: e.target.files?.[0] ?? null }))} />
            {files.projectFile && (
              <div className="file-preview">
                <span className="file-icon">📄</span>
                <span className="file-name">{files.projectFile.name}</span>
                <button type="button" className="file-remove"
                  onClick={() => setFiles(prev => ({ ...prev, projectFile: null }))}>×</button>
              </div>
            )}
          </Field>
          <Field label="Video URL">
            <input className="input" type="url" value={form['project-video']}
              placeholder="https://youtube.com/watch?v=..."
              onChange={e => set('project-video', e.target.value)} />
          </Field>
        </section>

        <div className="actions">
          <button className="btn" type="submit" disabled={status.type === 'loading'}>
            {status.type === 'loading' ? 'Creating...' : 'Add Project →'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={reset}>Clear</button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><label className="label">{label}</label>{children}</div>
}
