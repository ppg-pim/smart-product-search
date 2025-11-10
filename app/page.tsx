'use client'

import { useState } from 'react'

export default function Home() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [specificAnswer, setSpecificAnswer] = useState<any>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResults([])
    setSpecificAnswer(null)

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

      // Handle specific question responses
      if (data.questionType === 'specific') {
        setSpecificAnswer(data)
        // Also show the full product in results
        if (data.fullProduct) {
          setResults([data.fullProduct])
        }
      } else {
        // Handle list responses
        setResults(data.results || [])
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Group attributes by category for better display
  const groupAttributes = (product: any) => {
    const priorityFields = ['sku', 'name', 'product_name', 'productname', 'description', 'product_description']
    const footerFields = ['created_at', 'updated_at', 'createdat', 'updatedat']
    const searchableFields = ['searchable_text', 'searchabletext', 'searchable']
    
    const priority: any = {}
    const footer: any = {}
    const searchable: any = {}
    const other: any = {}

    Object.entries(product).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase()
      
      if (priorityFields.includes(lowerKey)) {
        priority[key] = value
      } else if (footerFields.includes(lowerKey)) {
        footer[key] = value
      } else if (searchableFields.includes(lowerKey)) {
        searchable[key] = value
      } else {
        other[key] = value
      }
    })

    return { priority, other, searchable, footer }
  }

  // Format field name for display
  const formatFieldName = (key: string): string => {
    // Handle specific field mappings
    const fieldMappings: { [key: string]: string } = {
      'sku': 'SKU',
      'product_name': 'Product Name',
      'productname': 'Product Name',
      'product_description': 'Description',
    }
    
    const lowerKey = key.toLowerCase()
    if (fieldMappings[lowerKey]) {
      return fieldMappings[lowerKey]
    }
    
    // Default formatting
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  }

  // Format date values
  const formatValue = (key: string, value: any): string => {
    const lowerKey = key.toLowerCase()
    if ((lowerKey.includes('created') || lowerKey.includes('updated')) && 
        typeof value === 'string' && value.includes('T')) {
      try {
        return new Date(value).toLocaleString()
      } catch {
        return String(value)
      }
    }
    return String(value)
  }

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto bg-gray-50">
      <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
        <h1 className="text-4xl font-bold mb-2 text-center" style={{ color: '#0078a9' }}>
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
              placeholder="Ask anything... (e.g., 'Show me PS 870' or 'What is the color of 0890A1/2AM012PTSAL?')"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0078a9] focus:border-transparent"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-8 py-3 text-white rounded-lg hover:opacity-90 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
              style={{ backgroundColor: '#0078a9' }}
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

      {/* Specific Answer Display */}
      {specificAnswer && (
        <div className="mb-6 bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">Answer</h3>
              <p className="text-blue-800 text-lg">{specificAnswer.answer}</p>
              
              {specificAnswer.extractedData && Object.keys(specificAnswer.extractedData).length > 0 && (
                <div className="mt-4 bg-white rounded-lg p-4 border border-blue-200">
                  <h4 className="font-semibold text-sm text-blue-900 mb-2">Extracted Information:</h4>
                  <div className="space-y-1">
                    {Object.entries(specificAnswer.extractedData).map(([key, value]) => (
                      <div key={key} className="text-sm">
                        <span className="font-medium text-gray-700">{formatFieldName(key)}:</span>{' '}
                        <span className="text-gray-900">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-semibold" style={{ color: '#0078a9' }}>
              {specificAnswer ? 'Full Product Details' : `Found ${results.length} ${results.length === 1 ? 'result' : 'results'}`}
            </h2>
          </div>

          <div className="space-y-6">
            {results.map((product, index) => {
              const { priority, other, searchable, footer } = groupAttributes(product)
              
              return (
                <div
                  key={index}
                  className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
                >
                  {/* Priority Fields (SKU, Name, Description) */}
                  {Object.keys(priority).length > 0 && (
                    <div className="mb-4 pb-4 border-b border-gray-200">
                      <div className="space-y-3">
                        {Object.entries(priority).map(([key, value]) => (
                          <div key={key}>
                            <span 
                              className="font-semibold text-sm uppercase tracking-wide"
                              style={{ color: '#0078a9' }}
                            >
                              {formatFieldName(key)}:
                            </span>{' '}
                            <span className="text-gray-900">
                              {formatValue(key, value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Technical Specifications */}
                  {Object.keys(other).length > 0 && (
                    <div className="mb-4">
                      <h3 
                        className="font-semibold mb-3 text-sm uppercase tracking-wide"
                        style={{ color: '#0078a9' }}
                      >
                        Technical Specifications
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                        {Object.entries(other).map(([key, value]) => (
                          <div key={key} className="flex flex-col">
                            <span className="text-gray-600 text-xs">
                              {formatFieldName(key)}
                            </span>
                            <span className="text-gray-900 font-medium">
                              {formatValue(key, value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Searchable Text Block */}
                  {Object.keys(searchable).length > 0 && (
                    <div className="mb-4 pb-4 border-b border-gray-200">
                      {Object.entries(searchable).map(([key, value]) => (
                        <div key={key}>
                          <span 
                            className="font-semibold text-sm uppercase tracking-wide"
                            style={{ color: '#0078a9' }}
                          >
                            {formatFieldName(key)}:
                          </span>
                          <div className="mt-2 text-gray-700 text-sm bg-gray-50 p-3 rounded">
                            {formatValue(key, value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Footer (Created At / Updated At) */}
                  {Object.keys(footer).length > 0 && (
                    <div className="pt-4 border-t border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-500">
                        {Object.entries(footer).map(([key, value]) => (
                          <div key={key}>
                            <span className="font-medium">
                              {formatFieldName(key)}:
                            </span>{' '}
                            {formatValue(key, value)}
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

      {!loading && results.length === 0 && query && !error && !specificAnswer && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500 text-lg">No results found for "{query}"</p>
          <p className="text-gray-400 text-sm mt-2">Try a different search term</p>
        </div>
      )}
    </main>
  )
}
