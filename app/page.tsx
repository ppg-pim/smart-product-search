'use client'

import { useState } from 'react'

// Utility function to strip HTML tags
const stripHtml = (html: string): string => {
  if (typeof html !== 'string') return String(html)
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

// Utility function to truncate long text
const truncateText = (text: string, maxLength: number = 150): string => {
  if (!text || text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

export default function Home() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!query.trim()) return
    
    setLoading(true)
    setError('')
    setResults([])

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

      setResults(data.results || [])
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

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2 text-center text-gray-800">
          🔍 Smart Product Search
        </h1>
        <p className="text-center text-gray-600 mb-6">
          Search using natural language - try "PS 870", "products under $50", or "show all"
        </p>

        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Show me PS 870 products, Find items under $50..."
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

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => handleQuickSearch('Show me all products')}
            className="px-4 py-2 text-sm bg-blue-100 hover:bg-blue-200 rounded-full text-blue-700 font-medium transition-colors"
          >
            📦 All products
          </button>
          <button
            onClick={() => handleQuickSearch('Show me PS 870')}
            className="px-4 py-2 text-sm bg-purple-100 hover:bg-purple-200 rounded-full text-purple-700 font-medium transition-colors"
          >
            🔍 PS 870
          </button>
          <button
            onClick={() => handleQuickSearch('Products under $100')}
            className="px-4 py-2 text-sm bg-green-100 hover:bg-green-200 rounded-full text-green-700 font-medium transition-colors"
          >
            💰 Under $100
          </button>
        </div>
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
                  const cleanValue = stripHtml(stringValue)
                  const displayValue = truncateText(cleanValue, 200)
                  
                  // Highlight important fields
                  const isImportant = ['sku', 'name', 'title', 'price', 'id'].includes(key.toLowerCase())
                  
                  return (
                    <div key={key} className="mb-3 pb-3 border-b border-gray-100 last:border-0">
                      <div className={`font-semibold capitalize mb-1 ${isImportant ? 'text-blue-700 text-lg' : 'text-gray-700 text-sm'}`}>
                        {key.replace(/_/g, ' ')}
                      </div>
                      <div className="text-gray-600 break-words">
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

      {!loading && results.length === 0 && query && !error && (
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
