'use client'

import { useState } from 'react'

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

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto bg-gray-50">
      <div className="bg-white rounded-lg shadow-md p-8 mb-8">
        <h1 className="text-4xl font-bold mb-2 text-center text-gray-800">
          🔍 Smart Product Search
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Ask anything in natural language
        </p>

        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex gap-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Show me all products, Find items under $50, Search for red products..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setQuery('Show me all products')}
            className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-full text-gray-700"
          >
            Show all products
          </button>
          <button
            onClick={() => setQuery('Find products under $100')}
            className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-full text-gray-700"
          >
            Under $100
          </button>
          <button
            onClick={() => setQuery('Show the most expensive items')}
            className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-full text-gray-700"
          >
            Most expensive
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Searching...</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-gray-800">
              Found {results.length} {results.length === 1 ? 'result' : 'results'}
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((product, index) => (
              <div
                key={index}
                className="p-5 bg-white border border-gray-200 rounded-lg hover:shadow-lg transition-shadow"
              >
                {Object.entries(product).map(([key, value]) => (
                  <div key={key} className="mb-2">
                    <span className="font-semibold text-gray-700 capitalize">
                      {key}:
                    </span>{' '}
                    <span className="text-gray-600">
                      {value === null ? 'N/A' : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && results.length === 0 && query && !error && (
        <div className="text-center py-12 bg-white rounded-lg shadow-md">
          <p className="text-gray-500 text-lg">No results found</p>
          <p className="text-gray-400 text-sm mt-2">Try a different search query</p>
        </div>
      )}
    </main>
  )
}
