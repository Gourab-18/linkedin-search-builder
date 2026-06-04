import { useState, useCallback, useEffect, useRef } from 'react'
import Papa from 'papaparse'

// ─── Constants ───────────────────────────────────────────────────────────────

const RECRUITER_ROLES = [
  'Recruiter', 'Technical Recruiter', 'Talent Acquisition',
  'Campus Recruiter', 'Sourcer', 'HR', 'People Operations', 'Talent Partner',
]

const CATEGORY_MAP = {
  'ML Engineer': 'ML/AI', 'AI Engineer': 'ML/AI', 'RAG Engineer': 'ML/AI', 'MLOps Engineer': 'ML/AI',
  'Backend Engineer': 'Backend', 'Java Developer': 'Backend', 'SDE-1': 'Backend', 'SDE-2': 'Backend', 'Senior Software Engineer': 'Backend',
  'Full Stack Engineer': 'Full Stack',
  'Data Scientist': 'Data', 'Data Engineer': 'Data',
  'Recruiter': 'Recruiter', 'Technical Recruiter': 'Recruiter', 'Talent Acquisition': 'Recruiter',
  'Campus Recruiter': 'Recruiter', 'Sourcer': 'Recruiter', 'HR': 'Recruiter',
  'People Operations': 'Recruiter', 'Talent Partner': 'Recruiter',
  'Engineering Manager': 'Management', 'Product Manager': 'Management',
}

const CATEGORIES = ['All', '⭐ Favorites', 'ML/AI', 'Backend', 'Full Stack', 'Data', 'Recruiter', 'Management', 'Custom']

// ─── Prompts ─────────────────────────────────────────────────────────────────

const ROLES_PROMPT = (c) =>
  `Given the company '${c}', suggest 12-15 relevant job roles that likely exist there. Focus on: Full Stack Engineer, Java Developer, Backend Engineer, ML Engineer, Data Scientist, RAG Engineer, AI Engineer, MLOps Engineer, Data Engineer, Product Manager, Engineering Manager, SDE-1, SDE-2, Senior Software Engineer, and domain-specific roles. Also return a relevance score 1 (low) to 3 (high) for each role based on how likely this company hires for it. Return ONLY a JSON array: [{"role": string, "score": number}]. No explanation.`

const INTEL_PROMPT = (c) =>
  `In exactly 2 lines, what does ${c} do? Be specific about their product, tech stack if known, and industry.`

const MSG_PROMPT = (bg, role, company) =>
  `Write a LinkedIn connection request message strictly under 300 characters. The sender is: ${bg}. They are reaching out to a ${role} at ${company}. Be specific, warm, and professional. No hashtags. No emojis. Output only the message, nothing else.`

const RESUME_PARSE_PROMPT = (text) =>
  `Parse this resume text and extract a concise professional background summary in 2-3 sentences covering: current/recent role, years of experience, key skills/technologies, and career goal if mentioned. Output only the summary, nothing else.\n\nResume:\n${text.slice(0, 4000)}`

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateSearchString(company, role) { return `"${role}" "${company}"` }

function linkedInPeopleUrl(company, role) {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"${role}" "${company}"`)}&origin=GLOBAL_SEARCH_HEADER`
}

function linkedInCurrentEmployeeUrl(company, role) {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(role)}&titleFreeText=${encodeURIComponent(role)}&company=${encodeURIComponent(company)}`
}

function getFromLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}

function saveToLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function getCategory(role) { return CATEGORY_MAP[role] || 'Other' }

function escapeCSV(val) {
  if (val == null) return ''
  const s = String(val)
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

function ScoreDots({ score }) {
  return (
    <span className="flex items-center gap-0.5 shrink-0">
      {[1, 2, 3].map(i => (
        <span key={i} className={`w-2 h-2 rounded-full ${
          i <= score
            ? score === 3 ? 'bg-green-400' : score === 2 ? 'bg-yellow-400' : 'bg-gray-400'
            : 'bg-gray-600/40'
        }`} />
      ))}
    </span>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [csvData, setCsvData] = useState(null)
  const [columns, setColumns] = useState([])
  const [selectedColumn, setSelectedColumn] = useState('')
  const [companies, setCompanies] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(null)

  // Persisted
  const [grokApiKey, setGrokApiKey] = useState(() => getFromLS('grok_api_key', ''))
  const [userBackground, setUserBackground] = useState(() => getFromLS('user_background', ''))
  const [companyRoles, setCompanyRoles] = useState(() => getFromLS('company_roles_cache', {}))   // { company: [{role,score}] }
  const [companyIntel, setCompanyIntel] = useState(() => getFromLS('company_intel_cache', {}))
  const [customRoles, setCustomRoles] = useState(() => getFromLS('custom_roles_cache', {}))
  const [companyNotes, setCompanyNotes] = useState(() => getFromLS('company_notes', {}))
  const [msgCache, setMsgCache] = useState(() => getFromLS('msg_cache', {}))
  const [favorites, setFavorites] = useState(() => getFromLS('favorites', {}))
  const [darkMode, setDarkMode] = useState(() => getFromLS('dark_mode', true))

  // UI
  const [loadingAI, setLoadingAI] = useState(false)
  const [loadingIntel, setLoadingIntel] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [loadingResume, setLoadingResume] = useState(false)
  const [copiedStr, setCopiedStr] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [aiError, setAiError] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [activeCategory, setActiveCategory] = useState('All')
  const [customRoleInput, setCustomRoleInput] = useState('')
  const [expandedCard, setExpandedCard] = useState(null)
  const [editingNote, setEditingNote] = useState(null)
  const [noteInput, setNoteInput] = useState('')
  const [checkedCompanies, setCheckedCompanies] = useState(new Set())
  const [bulkCopied, setBulkCopied] = useState(false)
  const [toast, setToast] = useState(null)   // { msg, type }
  const resumeInputRef = useRef(null)

  useEffect(() => saveToLS('grok_api_key', grokApiKey), [grokApiKey])
  useEffect(() => saveToLS('user_background', userBackground), [userBackground])
  useEffect(() => saveToLS('company_roles_cache', companyRoles), [companyRoles])
  useEffect(() => saveToLS('company_intel_cache', companyIntel), [companyIntel])
  useEffect(() => saveToLS('custom_roles_cache', customRoles), [customRoles])
  useEffect(() => saveToLS('company_notes', companyNotes), [companyNotes])
  useEffect(() => saveToLS('msg_cache', msgCache), [msgCache])
  useEffect(() => saveToLS('favorites', favorites), [favorites])
  useEffect(() => saveToLS('dark_mode', darkMode), [darkMode])

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── CSV handling ────────────────────────────────────────────────────────────

  const parseCSV = useCallback((file) => new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: r => resolve(r),
      error: reject,
    })
  }), [])

  const handleFile = useCallback(async (file, merge = false) => {
    if (!file) return
    const results = await parseCSV(file)
    if (!merge) {
      setCsvData(results.data)
      setColumns(results.meta.fields || [])
      setSelectedColumn(''); setCompanies([]); setSelectedCompany(null); setCompanyFilter('')
    } else {
      // Merge: add new companies without duplicates
      if (!selectedColumn) { showToast('Pick a company column first', 'error'); return }
      const existing = new Set(companies.map(c => c.toLowerCase()))
      const incoming = [...new Set(results.data.map(r => r[selectedColumn]).filter(Boolean))]
      const newOnes = incoming.filter(c => !existing.has(c.toLowerCase()))
      const dupes = incoming.length - newOnes.length
      setCompanies(prev => [...prev, ...newOnes].sort())
      setCsvData(prev => [...(prev || []), ...results.data])
      showToast(`${newOnes.length} new companies added, ${dupes} duplicates skipped`, 'success')
    }
  }, [parseCSV, companies, selectedColumn])

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv')) handleFile(file)
  }, [handleFile])

  const handleColumnSelect = (col) => {
    setSelectedColumn(col)
    const unique = [...new Set(csvData.map(row => row[col]).filter(Boolean))].sort()
    setCompanies(unique); setSelectedCompany(null)
  }

  // ── Groq API ────────────────────────────────────────────────────────────────

  const groqCall = async (prompt) => {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokApiKey}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.7 })
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    return data.choices[0].message.content.trim()
  }

  const fetchRoles = async (company) => {
    if (!grokApiKey) { setAiError('Enter your Groq API key in settings above.'); return }
    if (companyRoles[company]) return
    setLoadingAI(true); setAiError('')
    try {
      const content = await groqCall(ROLES_PROMPT(company))
      const match = content.match(/\[[\s\S]*\]/)
      if (!match) throw new Error('Could not parse roles from AI response')
      let parsed = JSON.parse(match[0])
      // normalise: accept both [{role,score}] and plain strings
      parsed = parsed.map(item =>
        typeof item === 'string' ? { role: item, score: 2 } : { role: item.role, score: item.score ?? 2 }
      )
      // sort by score desc
      parsed.sort((a, b) => b.score - a.score)
      setCompanyRoles(prev => ({ ...prev, [company]: parsed }))
    } catch (err) { setAiError(`AI error: ${err.message}`) }
    finally { setLoadingAI(false) }
  }

  const fetchIntel = async (company) => {
    if (!grokApiKey || companyIntel[company]) return
    setLoadingIntel(true)
    try {
      const content = await groqCall(INTEL_PROMPT(company))
      setCompanyIntel(prev => ({ ...prev, [company]: content }))
    } catch {}
    finally { setLoadingIntel(false) }
  }

  const fetchMessage = async (company, role) => {
    const key = `${company}::${role}`
    if (!grokApiKey || msgCache[key] || !userBackground.trim()) return
    setLoadingMsg(key)
    try {
      const msg = await groqCall(MSG_PROMPT(userBackground, role, company))
      setMsgCache(prev => ({ ...prev, [key]: msg }))
    } catch {}
    finally { setLoadingMsg('') }
  }

  // ── Resume upload ───────────────────────────────────────────────────────────

  const handleResume = async (file) => {
    if (!file) return
    if (!grokApiKey) { showToast('Enter Groq API key first', 'error'); return }
    setLoadingResume(true)
    try {
      const text = await file.text()
      const summary = await groqCall(RESUME_PARSE_PROMPT(text))
      setUserBackground(summary)
      showToast('Resume parsed — background updated!', 'success')
    } catch (err) {
      showToast(`Resume parse failed: ${err.message}`, 'error')
    } finally {
      setLoadingResume(false)
    }
  }

  // ── Company actions ─────────────────────────────────────────────────────────

  const handleSelectCompany = (company) => {
    setSelectedCompany(company); setAiError(''); setActiveCategory('All'); setExpandedCard(null)
    if (grokApiKey) {
      if (!companyRoles[company]) fetchRoles(company)
      if (!companyIntel[company]) fetchIntel(company)
    }
  }

  const copyToClipboard = (str) => {
    navigator.clipboard.writeText(str).then(() => { setCopiedStr(str); setTimeout(() => setCopiedStr(''), 2000) })
  }

  const copyAll = () => {
    const ai = (companyRoles[selectedCompany] || []).map(r => r.role ?? r)
    const custom = customRoles[selectedCompany] || []
    if (!ai.length && !custom.length) return
    const all = [...RECRUITER_ROLES, ...ai, ...custom].map(r => generateSearchString(selectedCompany, r)).join('\n')
    navigator.clipboard.writeText(all).then(() => { setCopiedStr('__all__'); setTimeout(() => setCopiedStr(''), 2000) })
  }

  const refreshRoles = () => {
    if (!selectedCompany) return
    setCompanyRoles(prev => { const u = { ...prev }; delete u[selectedCompany]; return u })
    fetchRoles(selectedCompany)
  }

  const addCustomRole = () => {
    const role = customRoleInput.trim()
    if (!role || !selectedCompany) return
    setCustomRoles(prev => ({ ...prev, [selectedCompany]: [...(prev[selectedCompany] || []), role] }))
    setCustomRoleInput('')
  }

  const removeCustomRole = (company, role) => {
    setCustomRoles(prev => ({ ...prev, [company]: (prev[company] || []).filter(r => r !== role) }))
  }

  const toggleFavorite = (company, role) => {
    const key = `${company}::${role}`
    setFavorites(prev => { const u = { ...prev }; u[key] ? delete u[key] : (u[key] = true); return u })
  }

  const toggleCardExpand = (key, company, role) => {
    if (expandedCard === key) { setExpandedCard(null); return }
    setExpandedCard(key)
    fetchMessage(company, role)
  }

  const startEditNote = (company) => { setEditingNote(company); setNoteInput(companyNotes[company] || '') }
  const saveNote = (company) => { setCompanyNotes(prev => ({ ...prev, [company]: noteInput })); setEditingNote(null) }

  const toggleCheck = (company, e) => {
    e.stopPropagation()
    setCheckedCompanies(prev => { const n = new Set(prev); n.has(company) ? n.delete(company) : n.add(company); return n })
  }

  const bulkCopy = () => {
    const lines = []
    for (const company of checkedCompanies) {
      const ai = (companyRoles[company] || []).map(r => r.role ?? r)
      const custom = customRoles[company] || []
      lines.push(`--- ${company} ---`)
      ;[...RECRUITER_ROLES, ...ai, ...custom].forEach(r => lines.push(generateSearchString(company, r)))
      lines.push('')
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => { setBulkCopied(true); setTimeout(() => setBulkCopied(false), 2000) })
  }

  // ── CSV Export ──────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const rows = [['Company', 'Notes', 'Roles Searched', 'Favorited Roles']]
    const allCompanies = companies.length ? companies : Object.keys(companyRoles)
    for (const company of allCompanies) {
      const ai = (companyRoles[company] || []).map(r => r.role ?? r)
      const custom = customRoles[company] || []
      const allR = [...RECRUITER_ROLES, ...ai, ...custom]
      const favRoles = allR.filter(r => favorites[`${company}::${r}`])
      rows.push([
        escapeCSV(company),
        escapeCSV(companyNotes[company] || ''),
        escapeCSV(allR.join(' | ')),
        escapeCSV(favRoles.join(' | ')),
      ])
    }
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'linkedin_search_export.csv'; a.click()
    URL.revokeObjectURL(url)
    showToast('CSV exported!', 'success')
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const filteredCompanies = companies.filter(c => c.toLowerCase().includes(companyFilter.toLowerCase()))

  // aiRoleItems: [{role, score}]
  const aiRoleItems = selectedCompany ? (companyRoles[selectedCompany] || []) : []
  const customRoleList = selectedCompany ? (customRoles[selectedCompany] || []) : []

  const allRoles = selectedCompany ? [
    ...RECRUITER_ROLES.map(r => ({ role: r, score: 2, category: 'Recruiter', custom: false })),
    ...aiRoleItems.map(({ role, score }) => ({ role, score, category: getCategory(role), custom: false })),
    ...customRoleList.map(r => ({ role: r, score: 2, category: 'Custom', custom: true })),
  ] : []

  const visibleRoles = (() => {
    if (activeCategory === 'All') return allRoles
    if (activeCategory === '⭐ Favorites') return allRoles.filter(({ role }) => favorites[`${selectedCompany}::${role}`])
    return allRoles.filter(r => r.category === activeCategory)
  })()

  // ── Theme ───────────────────────────────────────────────────────────────────

  const t = darkMode ? {
    bg: 'bg-gray-950', sidebar: 'bg-gray-900 border-gray-800', cardHover: 'hover:bg-gray-800',
    cardActive: 'bg-blue-900/40 border-blue-700',
    input: 'bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-blue-500',
    text: 'text-white', subtext: 'text-gray-400', codeCard: 'bg-gray-800', codeText: 'text-green-400',
    copyBtn: 'bg-gray-700 hover:bg-gray-600 text-gray-200', header: 'bg-gray-900 border-gray-800',
    uploadBorder: dragOver ? 'border-blue-400 bg-blue-950/20' : 'border-gray-700 hover:border-gray-500 bg-gray-900/50',
    tag: 'bg-gray-800 text-gray-300', intel: 'bg-blue-950/30 border-blue-800/50 text-blue-300',
    filterBtn: 'bg-gray-800 text-gray-400 hover:bg-gray-700', filterActive: 'bg-blue-600 text-white',
    msgBox: 'bg-gray-900 border-gray-700 text-gray-200', divider: 'border-gray-700',
    noteArea: 'bg-gray-800 border-gray-600 text-white placeholder-gray-500',
  } : {
    bg: 'bg-gray-50', sidebar: 'bg-white border-gray-200', cardHover: 'hover:bg-gray-50',
    cardActive: 'bg-blue-50 border-blue-400',
    input: 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500',
    text: 'text-gray-900', subtext: 'text-gray-500', codeCard: 'bg-gray-100', codeText: 'text-blue-700',
    copyBtn: 'bg-gray-200 hover:bg-gray-300 text-gray-700', header: 'bg-white border-gray-200',
    uploadBorder: dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50',
    tag: 'bg-gray-100 text-gray-600', intel: 'bg-blue-50 border-blue-200 text-blue-800',
    filterBtn: 'bg-gray-100 text-gray-600 hover:bg-gray-200', filterActive: 'bg-blue-600 text-white',
    msgBox: 'bg-white border-gray-200 text-gray-800', divider: 'border-gray-200',
    noteArea: 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400',
  }

  const borderClass = darkMode ? 'border-gray-800' : 'border-gray-200'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} flex flex-col`}>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-green-600 text-white' :
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-700 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Top Bar */}
      <header className={`${t.header} border-b px-6 py-4 flex items-center justify-between shrink-0`}>
        <div>
          <h1 className="text-xl font-bold">LinkedIn Search Builder</h1>
          <p className={`text-xs ${t.subtext}`}>Upload CSV → pick company column → get AI-powered search strings</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {companies.length > 0 && (
            <span className={`text-xs px-2 py-1 rounded-full ${t.tag}`}>{companies.length} companies</span>
          )}
          {(companies.length > 0 || Object.keys(companyRoles).length > 0) && (
            <button
              onClick={exportCSV}
              className="px-3 py-1.5 rounded-lg text-sm border bg-emerald-600 hover:bg-emerald-500 text-white border-transparent transition-colors font-medium"
            >
              ⬇ Export CSV
            </button>
          )}
          <button
            onClick={() => setDarkMode(d => !d)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${t.sidebar} ${t.subtext} ${t.cardHover} transition-colors`}
          >
            {darkMode ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
        <aside className={`w-72 shrink-0 ${t.sidebar} border-r flex flex-col overflow-hidden relative`}>

          {/* API Key */}
          <div className={`px-4 pt-4 pb-3 border-b ${borderClass}`}>
            <label className={`block text-xs font-semibold uppercase tracking-wide ${t.subtext} mb-1.5`}>Groq API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'} value={grokApiKey}
                onChange={e => setGrokApiKey(e.target.value)} placeholder="gsk_..."
                className={`w-full border rounded-lg px-3 py-2 text-sm pr-16 ${t.input} focus:outline-none`}
              />
              <button onClick={() => setShowApiKey(s => !s)} className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs ${t.subtext} hover:opacity-80`}>
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            {grokApiKey && <p className="text-xs text-green-500 mt-1">✓ Key saved to localStorage</p>}
          </div>

          {/* Your Background + Resume Upload */}
          <div className={`px-4 py-3 border-b ${borderClass}`}>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`block text-xs font-semibold uppercase tracking-wide ${t.subtext}`}>Your Background</label>
              <button
                onClick={() => resumeInputRef.current?.click()}
                disabled={loadingResume || !grokApiKey}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white transition-colors"
                title="Upload resume to auto-fill background"
              >
                {loadingResume ? <><Spinner /> Parsing...</> : '📄 Resume'}
              </button>
              <input
                ref={resumeInputRef} type="file" accept=".txt,.pdf,.doc,.docx" className="hidden"
                onChange={e => handleResume(e.target.files[0])}
              />
            </div>
            <textarea
              value={userBackground} onChange={e => setUserBackground(e.target.value)}
              placeholder="e.g. Java + Spring Boot backend engineer, 1.5 years at Oracle, transitioning into ML/AI roles — or upload your resume above"
              rows={3}
              className={`w-full border rounded-lg px-3 py-2 text-xs resize-none ${t.input} focus:outline-none`}
            />
            {userBackground && <p className="text-xs text-green-500 mt-1">✓ Saved — used for message generation</p>}
          </div>

          {/* Upload CSV */}
          <div className={`px-4 py-3 border-b ${borderClass}`}>
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById('csv-input').click()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${t.uploadBorder}`}
            >
              <input id="csv-input" type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files[0])} />
              <div className="text-2xl mb-1">📄</div>
              <p className={`text-xs font-medium ${t.text}`}>{csvData ? `✓ ${csvData.length} rows loaded` : 'Drop CSV or click'}</p>
            </div>

            {/* Merge additional CSV */}
            {companies.length > 0 && selectedColumn && (
              <button
                onClick={() => document.getElementById('csv-merge-input').click()}
                className={`mt-2 w-full text-xs py-1.5 rounded-lg border ${t.copyBtn} transition-colors`}
              >
                + Merge another CSV
              </button>
            )}
            <input id="csv-merge-input" type="file" accept=".csv" className="hidden" onChange={e => handleFile(e.target.files[0], true)} />

            {columns.length > 0 && (
              <div className="mt-3">
                <label className={`block text-xs font-semibold uppercase tracking-wide ${t.subtext} mb-1`}>Company Column</label>
                <select
                  value={selectedColumn} onChange={e => handleColumnSelect(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${t.input} focus:outline-none`}
                >
                  <option value="">-- pick column --</option>
                  {columns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Company Filter + List */}
          {companies.length > 0 && (
            <>
              <div className={`px-4 py-2 border-b ${borderClass}`}>
                <input
                  type="text" value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}
                  placeholder="Filter companies..."
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${t.input} focus:outline-none`}
                />
              </div>

              <div className={`flex-1 overflow-y-auto ${checkedCompanies.size >= 2 ? 'pb-16' : ''}`}>
                {filteredCompanies.map(company => (
                  <div key={company}>
                    <div className={`flex items-center border-b text-sm transition-colors ${darkMode ? 'border-gray-800/50' : 'border-gray-100'} ${
                      selectedCompany === company ? t.cardActive + ' font-semibold' : t.cardHover
                    }`}>
                      {/* Checkbox */}
                      <div className="pl-3 pr-1 py-3 flex items-center" onClick={e => toggleCheck(company, e)}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                          checkedCompanies.has(company) ? 'bg-blue-600 border-blue-600'
                            : darkMode ? 'border-gray-600 hover:border-gray-400' : 'border-gray-300 hover:border-gray-500'
                        }`}>
                          {checkedCompanies.has(company) && <span className="text-white text-xs leading-none">✓</span>}
                        </div>
                      </div>

                      <button onClick={() => handleSelectCompany(company)} className="flex-1 text-left px-2 py-3 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{company}</span>
                          {companyNotes[company] && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Has notes" />}
                          {companyRoles[company] && (
                            <span className={`text-xs shrink-0 ${darkMode ? 'text-green-500' : 'text-green-600'}`}>
                              ✓{companyRoles[company].length}
                            </span>
                          )}
                        </div>
                      </button>

                      <button
                        onClick={e => { e.stopPropagation(); startEditNote(company) }}
                        className={`px-2 py-3 text-sm transition-colors ${darkMode ? 'text-gray-600 hover:text-gray-300' : 'text-gray-300 hover:text-gray-600'}`}
                        title="Add note"
                      >✏️</button>
                    </div>

                    {editingNote === company && (
                      <div className={`px-3 py-2 border-b ${borderClass} ${darkMode ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
                        <textarea
                          autoFocus value={noteInput} onChange={e => setNoteInput(e.target.value)}
                          placeholder="Add notes (e.g. Messaged 2 recruiters, Applied via referral)..."
                          rows={3}
                          className={`w-full border rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none ${t.noteArea}`}
                        />
                        <div className="flex gap-2 mt-1.5">
                          <button onClick={() => saveNote(company)} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md">Save</button>
                          <button onClick={() => setEditingNote(null)} className={`px-3 py-1 text-xs rounded-md ${t.copyBtn}`}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {filteredCompanies.length === 0 && (
                  <p className={`px-4 py-6 text-sm text-center ${t.subtext}`}>No companies match</p>
                )}
              </div>

              {/* Bulk Copy bar */}
              {checkedCompanies.size >= 2 && (
                <div className={`absolute bottom-0 left-0 right-0 px-3 py-2 border-t ${borderClass} ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
                  <button onClick={bulkCopy} className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors">
                    {bulkCopied ? '✓ Copied!' : `📋 Copy All for ${checkedCompanies.size} Companies`}
                  </button>
                </div>
              )}
            </>
          )}
        </aside>

        {/* ── Main Content ──────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedCompany && (
            <div className={`flex flex-col items-center justify-center h-full ${t.subtext}`}>
              <div className="text-6xl mb-4">🔍</div>
              <p className="text-lg font-medium">
                {companies.length === 0 ? 'Upload a CSV to get started' : 'Select a company from the sidebar'}
              </p>
              <p className="text-sm mt-1">AI will auto-suggest roles when you click a company</p>
            </div>
          )}

          {selectedCompany && (
            <div>
              {/* Company Header */}
              <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h2 className="text-2xl font-bold">{selectedCompany}</h2>
                  <p className={`text-sm ${t.subtext} mt-0.5`}>
                    {loadingAI ? 'Fetching AI-suggested roles...'
                      : aiRoleItems.length > 0
                        ? `${RECRUITER_ROLES.length} recruiter + ${aiRoleItems.length} AI + ${customRoleList.length} custom · sorted by relevance`
                        : grokApiKey ? 'Click "Refresh Roles" to fetch AI suggestions'
                        : 'Add a Groq API key to get AI-suggested roles'}
                  </p>
                  {aiError && <p className="text-red-400 text-sm mt-1">{aiError}</p>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={refreshRoles} disabled={loadingAI}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors"
                  >
                    {loadingAI ? <span className="flex items-center gap-2"><Spinner />Fetching...</span> : '✨ Refresh Roles'}
                  </button>
                  {allRoles.length > 0 && (
                    <button onClick={copyAll} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white transition-colors">
                      {copiedStr === '__all__' ? '✓ Copied All!' : '📋 Copy All'}
                    </button>
                  )}
                </div>
              </div>

              {/* Company Intel */}
              {(companyIntel[selectedCompany] || loadingIntel) && (
                <div className={`mb-4 px-4 py-3 rounded-xl border text-sm leading-relaxed ${t.intel}`}>
                  {loadingIntel && !companyIntel[selectedCompany]
                    ? <span className="opacity-60">Loading company info...</span>
                    : companyIntel[selectedCompany]}
                </div>
              )}

              {/* Company Note display */}
              {companyNotes[selectedCompany] && (
                <div className={`mb-4 px-4 py-3 rounded-xl border text-sm leading-relaxed ${darkMode ? 'bg-amber-950/20 border-amber-800/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  <span className="font-semibold mr-2">📝 Note:</span>{companyNotes[selectedCompany]}
                </div>
              )}

              {/* Category Filter */}
              {allRoles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {CATEGORIES.filter(cat => {
                    if (cat === 'All') return true
                    if (cat === '⭐ Favorites') return allRoles.some(({ role }) => favorites[`${selectedCompany}::${role}`])
                    return allRoles.some(r => r.category === cat)
                  }).map(cat => (
                    <button key={cat} onClick={() => setActiveCategory(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeCategory === cat ? t.filterActive : t.filterBtn}`}
                    >
                      {cat}
                      {cat !== 'All' && cat !== '⭐ Favorites' && (
                        <span className="ml-1 opacity-60">{allRoles.filter(r => r.category === cat).length}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Custom Role Input */}
              <div className="flex gap-2 mb-5">
                <input
                  type="text" value={customRoleInput}
                  onChange={e => setCustomRoleInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomRole()}
                  placeholder="Add custom role (e.g. Platform Engineer)..."
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm ${t.input} focus:outline-none`}
                />
                <button onClick={addCustomRole} disabled={!customRoleInput.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors"
                >Add</button>
              </div>

              {/* Loading Skeleton */}
              {loadingAI && (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className={`h-12 rounded-lg animate-pulse ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`} style={{ opacity: 1 - i * 0.08 }} />
                  ))}
                </div>
              )}

              {/* Role Cards */}
              {!loadingAI && visibleRoles.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {visibleRoles.map(({ role, score, category, custom }) => {
                    const str = generateSearchString(selectedCompany, role)
                    const isCopied = copiedStr === str
                    const cardKey = `${selectedCompany}::${role}`
                    const isExpanded = expandedCard === cardKey
                    const isFav = !!favorites[cardKey]
                    const msg = msgCache[cardKey]
                    const isLoadingThisMsg = loadingMsg === cardKey

                    return (
                      <div
                        key={role}
                        className={`${t.codeCard} rounded-xl border transition-all ${darkMode ? 'border-gray-700/50' : 'border-gray-200'} ${isExpanded ? 'sm:col-span-2' : ''}`}
                      >
                        <div className="px-4 pt-3 pb-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {/* Star */}
                              <button
                                onClick={() => toggleFavorite(selectedCompany, role)}
                                className={`shrink-0 text-sm transition-colors ${isFav ? 'text-yellow-400' : darkMode ? 'text-gray-600 hover:text-yellow-400' : 'text-gray-300 hover:text-yellow-400'}`}
                              >★</button>
                              <span className={`text-xs font-semibold ${t.subtext} uppercase tracking-wide truncate`}>{role}</span>
                              <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${
                                category === 'Custom'
                                  ? darkMode ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                                  : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'
                              }`}>{category}</span>
                              {/* Score dots — only for AI roles */}
                              {!custom && category !== 'Recruiter' && <ScoreDots score={score} />}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {custom && (
                                <button onClick={() => removeCustomRole(selectedCompany, role)}
                                  className={`px-1.5 py-1 rounded text-xs transition-colors ${darkMode ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
                                >✕</button>
                              )}
                              <button onClick={() => copyToClipboard(str)}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${isCopied ? 'bg-green-600 text-white' : t.copyBtn}`}
                              >{isCopied ? '✓' : 'Copy'}</button>
                              {/* 🔗 People Search */}
                              <a href={linkedInPeopleUrl(selectedCompany, role)} target="_blank" rel="noopener noreferrer"
                                className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                                title="Search people on LinkedIn"
                              >🔗</a>
                              {/* 🏢 Current Employees */}
                              <a href={linkedInCurrentEmployeeUrl(selectedCompany, role)} target="_blank" rel="noopener noreferrer"
                                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
                                title="Filter to current employees"
                              >🏢</a>
                              {/* ✉️ Message */}
                              <button
                                onClick={() => toggleCardExpand(cardKey, selectedCompany, role)}
                                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                                  isExpanded
                                    ? darkMode ? 'bg-purple-700 text-white' : 'bg-purple-100 text-purple-700'
                                    : t.copyBtn
                                }`}
                                title="Generate connection message"
                              >✉️</button>
                            </div>
                          </div>
                          <code className={`text-xs font-mono ${t.codeText} break-all leading-relaxed mt-1 block`}>{str}</code>
                        </div>

                        {/* Expanded message */}
                        {isExpanded && (
                          <div className={`px-4 pb-3 border-t ${t.divider} mt-1`}>
                            <p className={`text-xs font-semibold uppercase tracking-wide ${t.subtext} mt-2 mb-2`}>Connection Message</p>
                            {!userBackground.trim() ? (
                              <p className={`text-xs ${t.subtext} italic`}>Add your background in the sidebar (or upload resume) to generate a message.</p>
                            ) : isLoadingThisMsg ? (
                              <div className="flex items-center gap-2 text-xs text-gray-400"><Spinner />Generating message...</div>
                            ) : msg ? (
                              <div>
                                <div className={`text-sm rounded-lg px-3 py-2 border leading-relaxed ${t.msgBox}`}>{msg}</div>
                                <div className="flex items-center justify-between mt-2">
                                  <span className={`text-xs ${msg.length > 300 ? 'text-red-400' : 'text-green-500'}`}>{msg.length}/300 chars</span>
                                  <div className="flex gap-2">
                                    <button onClick={() => copyToClipboard(msg)}
                                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${copiedStr === msg ? 'bg-green-600 text-white' : t.copyBtn}`}
                                    >{copiedStr === msg ? '✓ Copied!' : 'Copy Message'}</button>
                                    <button
                                      onClick={() => { setMsgCache(prev => { const u = { ...prev }; delete u[cardKey]; return u }); fetchMessage(selectedCompany, role) }}
                                      className={`px-3 py-1 rounded-md text-xs font-medium ${t.copyBtn} transition-colors`}
                                    >Regenerate</button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => fetchMessage(selectedCompany, role)}
                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded-lg transition-colors"
                              >Generate Message</button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {!loadingAI && visibleRoles.length === 0 && allRoles.length > 0 && (
                <div className={`text-center py-10 ${t.subtext}`}><p className="font-medium">No roles in this category</p></div>
              )}

              {!loadingAI && allRoles.length === 0 && !aiError && (
                <div className={`text-center py-16 ${t.subtext}`}>
                  <p className="text-4xl mb-3">✨</p>
                  <p className="font-medium">No roles yet</p>
                  <p className="text-sm mt-1">{grokApiKey ? 'Click "Refresh Roles" to fetch AI suggestions' : 'Add a Groq API key to use AI suggestions'}</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}
