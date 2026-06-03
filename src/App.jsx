import { useState, useCallback, useEffect } from 'react'
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

const CATEGORY_MAP = {
  'ML Engineer': 'ML/AI',
  'AI Engineer': 'ML/AI',
  'RAG Engineer': 'ML/AI',
  'MLOps Engineer': 'ML/AI',
  'Backend Engineer': 'Backend',
  'Java Developer': 'Backend',
  'SDE-1': 'Backend',
  'SDE-2': 'Backend',
  'Senior Software Engineer': 'Backend',
  'Full Stack Engineer': 'Full Stack',
  'Data Scientist': 'Data',
  'Data Engineer': 'Data',
  'Recruiter': 'Recruiter',
  'Technical Recruiter': 'Recruiter',
  'Talent Acquisition': 'Recruiter',
  'Campus Recruiter': 'Recruiter',
  'Sourcer': 'Recruiter',
  'HR': 'Recruiter',
  'People Operations': 'Recruiter',
  'Talent Partner': 'Recruiter',
  'Engineering Manager': 'Management',
  'Product Manager': 'Management',
}

const CATEGORIES = ['All', 'ML/AI', 'Backend', 'Full Stack', 'Data', 'Recruiter', 'Management', 'Custom']

const ROLES_PROMPT = (companyName) =>
  `Given the company '${companyName}', suggest 12-15 relevant job roles that likely exist there. Focus on: Full Stack Engineer, Java Developer, Backend Engineer, ML Engineer, Data Scientist, RAG Engineer, AI Engineer, MLOps Engineer, Data Engineer, Product Manager, Engineering Manager, SDE-1, SDE-2, Senior Software Engineer, and any domain-specific roles relevant to this company. Return ONLY a JSON array of simple role title strings (no company name, no extra text). No explanation.`

const INTEL_PROMPT = (companyName) =>
  `In exactly 2 lines, what does ${companyName} do? Be specific about their product, tech stack if known, and industry.`

function generateSearchString(company, role) {
  return `"${role}" "${company}"`
}

function linkedInUrl(company, role) {
  const q = encodeURIComponent(`"${role}" "${company}"`)
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`
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

function getCategory(role) {
  return CATEGORY_MAP[role] || 'Other'
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
  const [companyIntel, setCompanyIntel] = useState(() => getFromLS('company_intel_cache', {}))
  const [customRoles, setCustomRoles] = useState(() => getFromLS('custom_roles_cache', {}))
  const [darkMode, setDarkMode] = useState(() => getFromLS('dark_mode', true))

  const [loadingAI, setLoadingAI] = useState(false)
  const [loadingIntel, setLoadingIntel] = useState(false)
  const [copiedStr, setCopiedStr] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [aiError, setAiError] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [activeCategory, setActiveCategory] = useState('All')
  const [customRoleInput, setCustomRoleInput] = useState('')

  useEffect(() => saveToLS('grok_api_key', grokApiKey), [grokApiKey])
  useEffect(() => saveToLS('company_roles_cache', companyRoles), [companyRoles])
  useEffect(() => saveToLS('company_intel_cache', companyIntel), [companyIntel])
  useEffect(() => saveToLS('custom_roles_cache', customRoles), [customRoles])
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

  const groqCall = async (prompt) => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${grokApiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })
    })
    const data = await response.json()
    if (data.error) throw new Error(data.error.message)
    return data.choices[0].message.content.trim()
  }

  const fetchRoles = async (company) => {
    if (!grokApiKey) { setAiError('Enter your Groq API key in settings above.'); return }
    if (companyRoles[company]) return
    setLoadingAI(true)
    setAiError('')
    try {
      const content = await groqCall(ROLES_PROMPT(company))
      const match = content.match(/\[[\s\S]*\]/)
      if (!match) throw new Error('Could not parse roles from AI response')
      const parsed = JSON.parse(match[0])
      setCompanyRoles(prev => ({ ...prev, [company]: parsed }))
    } catch (err) {
      setAiError(`AI error: ${err.message}`)
    } finally {
      setLoadingAI(false)
    }
  }

  const fetchIntel = async (company) => {
    if (!grokApiKey || companyIntel[company]) return
    setLoadingIntel(true)
    try {
      const content = await groqCall(INTEL_PROMPT(company))
      setCompanyIntel(prev => ({ ...prev, [company]: content }))
    } catch {
      // silently skip intel errors
    } finally {
      setLoadingIntel(false)
    }
  }

  const handleSelectCompany = (company) => {
    setSelectedCompany(company)
    setAiError('')
    setActiveCategory('All')
    if (grokApiKey) {
      if (!companyRoles[company]) fetchRoles(company)
      if (!companyIntel[company]) fetchIntel(company)
    }
  }

  const copyToClipboard = (str) => {
    navigator.clipboard.writeText(str).then(() => {
      setCopiedStr(str)
      setTimeout(() => setCopiedStr(''), 2000)
    })
  }

  const copyAll = () => {
    const aiRoles = companyRoles[selectedCompany] || []
    const custom = customRoles[selectedCompany] || []
    if (!aiRoles.length && !custom.length) return
    const all = [...RECRUITER_ROLES, ...aiRoles, ...custom]
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
      return updated
    })
    fetchRoles(selectedCompany)
  }

  const addCustomRole = () => {
    const role = customRoleInput.trim()
    if (!role || !selectedCompany) return
    setCustomRoles(prev => ({
      ...prev,
      [selectedCompany]: [...(prev[selectedCompany] || []), role]
    }))
    setCustomRoleInput('')
  }

  const removeCustomRole = (company, role) => {
    setCustomRoles(prev => ({
      ...prev,
      [company]: (prev[company] || []).filter(r => r !== role)
    }))
  }

  const filteredCompanies = companies.filter(c =>
    c.toLowerCase().includes(companyFilter.toLowerCase())
  )

  const aiRoles = selectedCompany ? (companyRoles[selectedCompany] || []) : []
  const customRoleList = selectedCompany ? (customRoles[selectedCompany] || []) : []

  const allRoles = selectedCompany
    ? [
        ...RECRUITER_ROLES.map(r => ({ role: r, category: 'Recruiter', custom: false })),
        ...aiRoles.map(r => ({ role: r, category: getCategory(r), custom: false })),
        ...customRoleList.map(r => ({ role: r, category: 'Custom', custom: true })),
      ]
    : []

  const visibleRoles = activeCategory === 'All'
    ? allRoles
    : allRoles.filter(r => r.category === activeCategory)

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
    intel: 'bg-blue-950/30 border-blue-800/50 text-blue-300',
    filterBtn: 'bg-gray-800 text-gray-400 hover:bg-gray-700',
    filterActive: 'bg-blue-600 text-white',
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
    intel: 'bg-blue-50 border-blue-200 text-blue-800',
    filterBtn: 'bg-gray-100 text-gray-600 hover:bg-gray-200',
    filterActive: 'bg-blue-600 text-white',
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
              <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h2 className="text-2xl font-bold">{selectedCompany}</h2>
                  <p className={`text-sm ${t.subtext} mt-0.5`}>
                    {loadingAI
                      ? 'Fetching AI-suggested roles...'
                      : aiRoles.length > 0
                        ? `${RECRUITER_ROLES.length} recruiter + ${aiRoles.length} AI + ${customRoleList.length} custom`
                        : grokApiKey
                          ? 'Click "Refresh Roles" to fetch AI suggestions'
                          : 'Add a Groq API key to get AI-suggested roles'
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
                  {allRoles.length > 0 && (
                    <button
                      onClick={copyAll}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white transition-colors"
                    >
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
                    : companyIntel[selectedCompany]
                  }
                </div>
              )}

              {/* Category Filter */}
              {allRoles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {CATEGORIES.filter(cat =>
                    cat === 'All' || allRoles.some(r => r.category === cat)
                  ).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        activeCategory === cat ? t.filterActive : t.filterBtn
                      }`}
                    >
                      {cat}
                      {cat !== 'All' && (
                        <span className="ml-1 opacity-60">
                          {allRoles.filter(r => r.category === cat).length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Custom Role Input */}
              {selectedCompany && (
                <div className="flex gap-2 mb-5">
                  <input
                    type="text"
                    value={customRoleInput}
                    onChange={e => setCustomRoleInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomRole()}
                    placeholder="Add custom role (e.g. Platform Engineer)..."
                    className={`flex-1 border rounded-lg px-3 py-2 text-sm ${t.input} focus:outline-none`}
                  />
                  <button
                    onClick={addCustomRole}
                    disabled={!customRoleInput.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors"
                  >
                    Add
                  </button>
                </div>
              )}

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
              {!loadingAI && visibleRoles.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {visibleRoles.map(({ role, category, custom }) => {
                    const str = generateSearchString(selectedCompany, role)
                    const isCopied = copiedStr === str
                    return (
                      <div
                        key={role}
                        className={`${t.codeCard} rounded-xl px-4 py-3 flex flex-col gap-1.5 border ${darkMode ? 'border-gray-700/50' : 'border-gray-200'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-xs font-semibold ${t.subtext} uppercase tracking-wide truncate`}>
                              {role}
                            </span>
                            <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${
                              category === 'Custom'
                                ? darkMode ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                                : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'
                            }`}>
                              {category}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {custom && (
                              <button
                                onClick={() => removeCustomRole(selectedCompany, role)}
                                className={`px-1.5 py-1 rounded text-xs transition-colors ${darkMode ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
                                title="Remove"
                              >
                                ✕
                              </button>
                            )}
                            <button
                              onClick={() => copyToClipboard(str)}
                              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                                isCopied ? 'bg-green-600 text-white' : t.copyBtn
                              }`}
                            >
                              {isCopied ? '✓' : 'Copy'}
                            </button>
                            <a
                              href={linkedInUrl(selectedCompany, role)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                            >
                              🔗
                            </a>
                          </div>
                        </div>
                        <code className={`text-xs font-mono ${t.codeText} break-all leading-relaxed`}>
                          {str}
                        </code>
                      </div>
                    )
                  })}
                </div>
              )}

              {!loadingAI && visibleRoles.length === 0 && allRoles.length > 0 && (
                <div className={`text-center py-10 ${t.subtext}`}>
                  <p className="font-medium">No roles in this category</p>
                </div>
              )}

              {!loadingAI && allRoles.length === 0 && !aiError && (
                <div className={`text-center py-16 ${t.subtext}`}>
                  <p className="text-4xl mb-3">✨</p>
                  <p className="font-medium">No roles yet</p>
                  <p className="text-sm mt-1">
                    {grokApiKey ? 'Click "Refresh Roles" to fetch AI suggestions' : 'Add a Groq API key to use AI suggestions'}
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
