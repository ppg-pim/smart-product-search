'use client'

import { useState, useEffect } from 'react'

// Utility function to decode HTML entities AND strip HTML tags
const decodeHtml = (html: string): string => {
  if (typeof html !== 'string') return String(html)
  
  // Create a temporary element to decode HTML entities
  const txt = document.createElement('textarea')
  txt.innerHTML = html
  let decoded = txt.value
  
  // Now strip any remaining HTML tags
  decoded = decoded.replace(/<[^>]*>/g, '')
  
  // Replace common entities that might not decode properly
  decoded = decoded
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&deg;/g, '°')
  
  return decoded.trim()
}

// Utility function to truncate long text
const truncateText = (text: string, maxLength: number = 150): string => {
  if (!text || text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

// Truncate search history display
const truncateSearchQuery = (text: string, maxLength: number = 30): string => {
  if (!text || text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

export default function Home() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [specificAnswer, setSpecificAnswer] = useState<string | null>(null)
  const [extractedData, setExtractedData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchHistory, setSearchHistory] = useState<string[]>([])

  // Load search history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('searchHistory')
    if (savedHistory) {
      try {
        setSearchHistory(JSON.parse(savedHistory))
      } catch (e) {
        console.error('Failed to parse search history', e)
      }
    }
  }, [])

  // Save search to history
  const addToHistory = (searchQuery: string) => {
    if (!searchQuery.trim()) return
    
    setSearchHistory(prev => {
      // Remove duplicates and add to front
      const filtered = prev.filter(q => q !== searchQuery)
      const newHistory = [searchQuery, ...filtered].slice(0, 5) // Keep only last 5
      
      // Save to localStorage
      localStorage.setItem('searchHistory', JSON.stringify(newHistory))
      
      return newHistory
    })
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!query.trim()) return
    
    setLoading(true)
    setError('')
    setResults([])
    setSpecificAnswer(null)
    setExtractedData(null)

    // Add to search history
    addToHistory(query)

    try {
      const response = await fetch('/api/smart-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Search failed')
      }

      // Handle specific question response
      if (data.questionType === 'specific') {
        setSpecificAnswer(data.answer)
        setExtractedData(data.extractedData)
      } else {
        // Handle list response
        setResults(data.results || [])
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleQuickSearch = (searchQuery: string) => {
    setQuery(searchQuery)
    // Auto-submit
    setTimeout(() => {
      const form = document.querySelector('form')
      form?.requestSubmit()
    }, 100)
  }

  const clearHistory = () => {
    setSearchHistory([])
    localStorage.removeItem('searchHistory')
  }

  // Icon mapping for different search types
  const getSearchIcon = (query: string): string => {
    const lowerQuery = query.toLowerCase()
    if (lowerQuery.includes('color') || lowerQuery.includes('colour')) return '🎨'
    if (lowerQuery.includes('price')) return '💰'
    if (lowerQuery.includes('all')) return '📦'
    if (lowerQuery.includes('what') || lowerQuery.includes('?')) return '❓'
    return '🔍'
  }

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2 text-center text-gray-800">
          🔍 Smart Product Search
        </h1>
        <p className="text-center text-gray-600 mb-6">
          Ask questions or search products - try "What is the color of 0890A1/2AM012PTSAL?" or "Show me PS 870"
        </p>

        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., What is the color of 0890A1/2AM012PTSAL?, Show me PS 870..."
              className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors shadow-md hover:shadow-lg"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  Searching...
                </span>
              ) : 'Search'}
            </button>
          </div>
        </form>

        {/* Search History */}
        {searchHistory.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">Recent Searches:</p>
              <button
                onClick={clearHistory}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Clear History
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {searchHistory.map((historyQuery, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickSearch(historyQuery)}
                  className="px-4 py-2 text-sm bg-gradient-to-r from-blue-100 to-indigo-100 hover:from-blue-200 hover:to-indigo-200 rounded-full text-blue-700 font-medium transition-all shadow-sm hover:shadow-md"
                  title={historyQuery}
                >
                  {getSearchIcon(historyQuery)} {truncateSearchQuery(historyQuery)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handleQuickSearch('Show me all products')}
              className="px-4 py-2 text-sm bg-blue-100 hover:bg-blue-200 rounded-full text-blue-700 font-medium transition-colors"
            >
              📦 All products
            </button>
            <button
              onClick={() => handleQuickSearch('What is the color of 0890A1/2AM012PTSAL')}
              className="px-4 py-2 text-sm bg-purple-100 hover:bg-purple-200 rounded-full text-purple-700 font-medium transition-colors"
            >
              🎨 Color of 0890A1/2AM012PTSAL
            </button>
            <button
              onClick={() => handleQuickSearch('Show me PS 870')}
              className="px-4 py-2 text-sm bg-indigo-100 hover:bg-indigo-200 rounded-full text-indigo-700 font-medium transition-colors"
            >
              🔍 PS 870
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-lg shadow">
          <strong className="font-semibold">Error:</strong> {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
          <p className="mt-4 text-gray-600 text-lg">Searching products...</p>
        </div>
      )}

      {/* Specific Answer Display */}
      {!loading && specificAnswer && (
        <div className="mb-6">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-8 rounded-xl shadow-xl">
            <div className="flex items-start gap-4">
              <div className="text-4xl">💡</div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-3">Answer</h2>
                <p className="text-xl leading-relaxed">{decodeHtml(specificAnswer)}</p>
                
                {extractedData && Object.keys(extractedData).length > 0 && (
                  <div className="mt-6 pt-6 border-t border-white/30">
                    <h3 className="text-lg font-semibold mb-3">Extracted Information:</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.entries(extractedData).map(([key, value]) => (
                        <div key={key} className="bg-white/10 backdrop-blur rounded-lg p-3">
                          <div className="text-sm font-medium opacity-90 capitalize">
                            {key.replace(/_/g, ' ')}
                          </div>
                          <div className="text-lg font-semibold mt-1">
                            {decodeHtml(String(value))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Product List Display */}
      {!loading && results.length > 0 && (
        <div>
          <div className="mb-6 flex items-center justify-between bg-white p-4 rounded-lg shadow">
            <h2 className="text-2xl font-semibold text-gray-800">
              ✅ Found {results.length} {results.length === 1 ? 'result' : 'results'}
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {results.map((product, index) => (
              <div
                key={index}
                className="p-6 bg-white border-2 border-gray-200 rounded-xl hover:shadow-xl hover:border-blue-300 transition-all duration-200"
              >
                {Object.entries(product).map(([key, value]) => {
                  // Skip null or undefined values
                  if (value === null || value === undefined) return null
                  
                  const stringValue = String(value)
                  const cleanValue = decodeHtml(stringValue)
                  const displayValue = truncateText(cleanValue, 200)
                  
                  // Highlight important fields
                  const isImportant = ['sku', 'name', 'title', 'price', 'id'].includes(key.toLowerCase())
                  
                  return (
                    <div key={key} className="mb-3 pb-3 border-b border-gray-100 last:border-0">
                      <div className={`font-semibold capitalize mb-1 ${isImportant ? 'text-blue-700 text-lg' : 'text-gray-700 text-sm'}`}>
                        {key.replace(/_/g, ' ')}
                      </div>
                      <div className="text-gray-600 break-words whitespace-pre-wrap">
                        {displayValue || 'N/A'}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && results.length === 0 && !specificAnswer && query && !error && (
        <div className="text-center py-16 bg-white rounded-xl shadow-lg">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-gray-500 text-xl font-semibold">No results found</p>
          <p className="text-gray-400 text-sm mt-2">Try a different search query or check your spelling</p>
          <div className="mt-6">
            <button
              onClick={() => handleQuickSearch('Show me all products')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
            >
              Show All Products
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
