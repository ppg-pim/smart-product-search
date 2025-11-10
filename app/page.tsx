'use client'

import { useState } from 'react'

export default function Home() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
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

  // Group attributes by category for better display
  const groupAttributes = (product: any) => {
    const priorityFields = ['sku', 'name', 'brand', 'color', 'chemistry', 'description']
    const priority: any = {}
    const other: any = {}

    Object.entries(product).forEach(([key, value]) => {
      if (priorityFields.includes(key.toLowerCase())) {
        priority[key] = value
      } else {
        other[key] = value
      }
    })

    return { priority, other }
  }

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto bg-gray-50">
      <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
        <h1 className="text-4xl font-bold mb-2 text-center text-gray-800">
          Smart Product Search
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Search products using natural language
        </p>

        <form onSubmit={handleSearch}>
          <div className="flex gap-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask anything... (e.g., 'Show me PS 870' or 'Find products with blue color')"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          <strong>Error:</strong> {error}
        </div>
      )}

      {results.length > 0 && (
        <div>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-gray-800">
              Found {results.length} {results.length === 1 ? 'result' : 'results'}
            </h2>
          </div>

          <div className="space-y-6">
            {results.map((product, index) => {
              const { priority, other } = groupAttributes(product)
              
              return (
                <div
                  key={index}
                  className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
                >
                  {/* Priority Fields */}
                  {Object.keys(priority).length > 0 && (
                    <div className="mb-4 pb-4 border-b border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(priority).map(([key, value]) => (
                          <div key={key}>
                            <span className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
                              {key.replace(/_/g, ' ')}:
                            </span>{' '}
                            <span className="text-gray-900">
                              {String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Other Attributes */}
                  {Object.keys(other).length > 0 && (
                    <div>
                      <h3 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">
                        Technical Specifications
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                        {Object.entries(other).map(([key, value]) => (
                          <div key={key} className="flex flex-col">
                            <span className="text-gray-600 text-xs">
                              {key.replace(/_/g, ' ')}
                            </span>
                            <span className="text-gray-900 font-medium">
                              {String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loading && results.length === 0 && query && !error && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500 text-lg">No results found for "{query}"</p>
          <p className="text-gray-400 text-sm mt-2">Try a different search term</p>
        </div>
      )}
    </main>
  )
}
