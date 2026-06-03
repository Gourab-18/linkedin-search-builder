import { useState, useCallback, useEffect, useRef } from 'react'
import Papa from 'papaparse'

const RECRUITER_ROLES = [
  'Recruiter',
  'Technical Recruiter',
  'Talent Acquisition',
  'Campus Recruiter',
  'Sourcer',
  'HR',
  'People Operations',
  'Talent Partner',
]

const GROK_PROMPT = (companyName) =>
  `Given the company '${companyName}', suggest 12-15 relevant job roles that likely exist there. Focus on: Full Stack Engineer, Java Developer, Backend Engineer, ML Engineer, Data Scientist, RAG Engineer, AI Engineer, MLOps Engineer, Data Engineer, Product Manager, Engineering Manager, SDE-1, SDE-2, Senior Software Engineer, and any domain-specific roles relevant to this company. Return ONLY a JSON array of simple role title strings (no company name, no extra text). No explanation.`

function generateSearchString(company, role) {
  return `"${role}" "${company}"`
}

function getFromLS(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

function saveToLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

export default function App() {
  const [csvData, setCsvData] = useState(null)
  const [columns, setColumns] = useState([])
  const [selectedColumn, setSelectedColumn] = useState('')
  const [companies, setCompanies] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(null)

  // Persisted state
  const [grokApiKey, setGrokApiKey] = useState(() => getFromLS('grok_api_key', ''))
  const [companyRoles, setCompanyRoles] = useState(() => getFromLS('company_roles_cache', {}))
  const [darkMode, setDarkMode] = useState(() => getFromLS('dark_mode', true))

  const [loadingAI, setLoadingAI] = useState(false)
  const [copiedStr, setCopiedStr] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [aiError, setAiError] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  // Persist on change
  useEffect(() => saveToLS('grok_api_key', grokApiKey), [grokApiKey])
  useEffect(() => saveToLS('company_roles_cache', companyRoles), [companyRoles])
  useEffect(() => saveToLS('dark_mode', darkMode), [darkMode])

  const handleFile = useCallback((file) => {
    if (!file) return
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvData(results.data)
        setColumns(results.meta.fields || [])
        setSelectedColumn('')
        setCompanies([])
        setSelectedCompany(null)
        setCompanyFilter('')
      }
    })
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.csv')) handleFile(file)
  }, [handleFile])

  const handleColumnSelect = (col) => {
    setSelectedColumn(col)
    const unique = [...new Set(csvData.map(row => row[col]).filter(Boolean))].sort()
    setCompanies(unique)
    setSelectedCompany(null)
  }

  const fetchRoles = async (company) => {
    if (!grokApiKey) {
      setAiError('Enter your Groq API key in settings above.')
      return
    }
    if (companyRoles[company]) return // already cached
    setLoadingAI(true)
    setAiError('')
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${grokApiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: GROK_PROMPT(company) }],
          temperature: 0.7
        })
      })
      const data = await response.json()
      if (data.error) throw new Error(data.error.message)
      const content = data.choices[0].message.content.trim()
      // Extract JSON array even if wrapped in markdown
      const match = content.match(/\[[\s\S]*\]/)
      if (!match) throw new Error('Could not parse roles from AI response')
      const parsed = JSON.parse(match[0])
      setCompanyRoles(prev => {
        const updated = { ...prev, [company]: parsed }
        saveToLS('company_roles_cache', updated)
        return updated
      })
    } catch (err) {
      setAiError(`AI error: ${err.message}`)
    } finally {
      setLoadingAI(false)
    }
  }

  const handleSelectCompany = (company) => {
    setSelectedCompany(company)
    setAiError('')
    if (!companyRoles[company] && grokApiKey) {
      fetchRoles(company)
    }
  }

  const copyToClipboard = (str) => {
    navigator.clipboard.writeText(str).then(() => {
      setCopiedStr(str)
      setTimeout(() => setCopiedStr(''), 2000)
    })
  }

  const copyAll = () => {
    const roleList = companyRoles[selectedCompany] || []
    if (!roleList.length) return
    const all = [...RECRUITER_ROLES, ...roleList]
      .map(role => generateSearchString(selectedCompany, role))
      .join('\n')
    navigator.clipboard.writeText(all).then(() => {
      setCopiedStr('__all__')
      setTimeout(() => setCopiedStr(''), 2000)
    })
  }

  const refreshRoles = () => {
    if (!selectedCompany) return
    setCompanyRoles(prev => {
      const updated = { ...prev }
      delete updated[selectedCompany]
      saveToLS('company_roles_cache', updated)
      return updated
    })
    fetchRoles(selectedCompany)
  }

  const filteredCompanies = companies.filter(c =>
    c.toLowerCase().includes(companyFilter.toLowerCase())
  )

  const aiRoles = selectedCompany ? (companyRoles[selectedCompany] || []) : []
  const roleList = selectedCompany ? [...RECRUITER_ROLES, ...aiRoles] : []

  // Theme classes
  const t = darkMode ? {
    bg: 'bg-gray-950',
    sidebar: 'bg-gray-900 border-gray-800',
    card: 'bg-gray-900 border-gray-800',
    cardHover: 'hover:bg-gray-800',
    cardActive: 'bg-blue-900/40 border-blue-700',
    input: 'bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-blue-500',
    text: 'text-white',
    subtext: 'text-gray-400',
    codeCard: 'bg-gray-800',
    codeText: 'text-green-400',
    copyBtn: 'bg-gray-700 hover:bg-gray-600 text-gray-200',
    header: 'bg-gray-900 border-gray-800',
    uploadBorder: dragOver ? 'border-blue-400 bg-blue-950/20' : 'border-gray-700 hover:border-gray-500 bg-gray-900/50',
    tag: 'bg-gray-800 text-gray-300',
  } : {
    bg: 'bg-gray-50',
    sidebar: 'bg-white border-gray-200',
    card: 'bg-white border-gray-200',
    cardHover: 'hover:bg-gray-50',
    cardActive: 'bg-blue-50 border-blue-400',
    input: 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500',
    text: 'text-gray-900',
    subtext: 'text-gray-500',
    codeCard: 'bg-gray-100',
    codeText: 'text-blue-700',
    copyBtn: 'bg-gray-200 hover:bg-gray-300 text-gray-700',
    header: 'bg-white border-gray-200',
    uploadBorder: dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50',
    tag: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} flex flex-col`}>
      {/* Top Bar */}
      <header className={`${t.header} border-b px-6 py-4 flex items-center justify-between shrink-0`}>
        <div>
          <h1 className="text-xl font-bold">LinkedIn Search Builder</h1>
          <p className={`text-xs ${t.subtext}`}>Upload CSV → pick company column → get AI-powered search strings</p>
        </div>
        <div className="flex items-center gap-3">
          {companies.length > 0 && (
            <span className={`text-xs px-2 py-1 rounded-full ${t.tag}`}>
              {companies.length} companies
            </span>
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
        {/* Left Sidebar */}
        <aside className={`w-72 shrink-0 ${t.sidebar} border-r flex flex-col overflow-hidden`}>
          {/* API Key */}
          <div className={`px-4 pt-4 pb-3 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
            <label className={`block text-xs font-semibold uppercase tracking-wide ${t.subtext} mb-1.5`}>
              Groq API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={grokApiKey}
                onChange={e => setGrokApiKey(e.target.value)}
                placeholder="gsk_..."
                className={`w-full border rounded-lg px-3 py-2 text-sm pr-16 ${t.input} focus:outline-none`}
              />
              <button
                onClick={() => setShowApiKey(s => !s)}
                className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs ${t.subtext} hover:opacity-80`}
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            {grokApiKey && (
              <p className="text-xs text-green-500 mt-1">✓ Key saved to localStorage</p>
            )}
          </div>

          {/* Upload */}
          <div className={`px-4 py-3 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById('csv-input').click()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${t.uploadBorder}`}
            >
              <input
                id="csv-input"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => handleFile(e.target.files[0])}
              />
              <div className="text-2xl mb-1">📄</div>
              <p className={`text-xs font-medium ${t.text}`}>
                {csvData ? `✓ ${csvData.length} rows loaded` : 'Drop CSV or click'}
              </p>
            </div>

            {columns.length > 0 && (
              <div className="mt-3">
                <label className={`block text-xs font-semibold uppercase tracking-wide ${t.subtext} mb-1`}>
                  Company Column
                </label>
                <select
                  value={selectedColumn}
                  onChange={e => handleColumnSelect(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${t.input} focus:outline-none`}
                >
                  <option value="">-- pick column --</option>
                  {columns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Company Filter + List */}
          {companies.length > 0 && (
            <>
              <div className={`px-4 py-2 border-b ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                <input
                  type="text"
                  value={companyFilter}
                  onChange={e => setCompanyFilter(e.target.value)}
                  placeholder="Filter companies..."
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${t.input} focus:outline-none`}
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredCompanies.map(company => (
                  <button
                    key={company}
                    onClick={() => handleSelectCompany(company)}
                    className={`w-full text-left px-4 py-3 text-sm border-b transition-colors ${
                      darkMode ? 'border-gray-800/50' : 'border-gray-100'
                    } ${
                      selectedCompany === company
                        ? t.cardActive + ' font-semibold'
                        : t.cardHover
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{company}</span>
                      {companyRoles[company] && (
                        <span className={`text-xs ml-2 shrink-0 ${darkMode ? 'text-green-500' : 'text-green-600'}`}>
                          ✓ {companyRoles[company].length}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
                {filteredCompanies.length === 0 && (
                  <p className={`px-4 py-6 text-sm text-center ${t.subtext}`}>No companies match</p>
                )}
              </div>
            </>
          )}
        </aside>

        {/* Main Content */}
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
              <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
                <div>
                  <h2 className="text-2xl font-bold">{selectedCompany}</h2>
                  <p className={`text-sm ${t.subtext} mt-0.5`}>
                    {loadingAI
                      ? 'Fetching AI-suggested roles...'
                      : aiRoles.length > 0
                        ? `${RECRUITER_ROLES.length} recruiter + ${aiRoles.length} role search strings`
                        : grokApiKey
                          ? 'Click "Refresh Roles" to fetch AI suggestions'
                          : 'Add a Grok API key to get AI-suggested roles'
                    }
                  </p>
                  {aiError && <p className="text-red-400 text-sm mt-1">{aiError}</p>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={refreshRoles}
                    disabled={loadingAI}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors"
                  >
                    {loadingAI
                      ? <span className="flex items-center gap-2"><Spinner />Fetching...</span>
                      : '✨ Refresh Roles'
                    }
                  </button>
                  {roleList.length > 0 && (
                    <button
                      onClick={copyAll}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white transition-colors"
                    >
                      {copiedStr === '__all__' ? '✓ Copied All!' : '📋 Copy All'}
                    </button>
                  )}
                </div>
              </div>

              {/* Loading Skeleton */}
              {loadingAI && (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-12 rounded-lg animate-pulse ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}
                      style={{ opacity: 1 - i * 0.08 }}
                    />
                  ))}
                </div>
              )}

              {/* Role Cards Grid */}
              {!loadingAI && roleList.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {roleList.map((role) => {
                    const str = generateSearchString(selectedCompany, role)
                    const isCopied = copiedStr === str
                    return (
                      <div
                        key={role}
                        className={`${t.codeCard} rounded-xl px-4 py-3 flex flex-col gap-1.5 border ${darkMode ? 'border-gray-700/50' : 'border-gray-200'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-semibold ${t.subtext} uppercase tracking-wide truncate`}>
                            {role}
                          </span>
                          <button
                            onClick={() => copyToClipboard(str)}
                            className={`shrink-0 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                              isCopied ? 'bg-green-600 text-white' : t.copyBtn
                            }`}
                          >
                            {isCopied ? '✓ Copied!' : 'Copy'}
                          </button>
                        </div>
                        <code className={`text-xs font-mono ${t.codeText} break-all leading-relaxed`}>
                          {str}
                        </code>
                      </div>
                    )
                  })}
                </div>
              )}

              {!loadingAI && roleList.length === 0 && !aiError && (
                <div className={`text-center py-16 ${t.subtext}`}>
                  <p className="text-4xl mb-3">✨</p>
                  <p className="font-medium">No roles yet</p>
                  <p className="text-sm mt-1">
                    {grokApiKey ? 'Click "Refresh Roles" to fetch AI suggestions' : 'Add a Grok API key to use AI suggestions'}
                  </p>
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
