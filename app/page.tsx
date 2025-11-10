'use client'

import { useState } from 'react'

export default function Home() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchParams, setSearchParams] = useState<any>(null)
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResults([])
    setExpandedProduct(null)

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

      setResults(data.results)
      setSearchParams(data.searchParams)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Group attributes by category for better organization
  const categorizeAttributes = (product: any) => {
    const categories: { [key: string]: { [key: string]: any } } = {
      'Basic Info': {},
      'Physical Properties': {},
      'Performance Properties': {},
      'Application': {},
      'Specifications': {},
      'Other': {}
    }

    const basicInfoKeys = ['SKU', 'Product Name', 'Product Description', 'Brand', 'Color', 'Chemistry', 'Categories', 'Product Type']
    const physicalKeys = ['Viscosity', 'Specific Gravity', 'Flash Point', 'VOC', 'Density', 'Weight']
    const performanceKeys = ['Adhesion', 'Tensile Strength', 'Elongation', 'Flexibility', 'Temperature Range', 'Cure Time']
    const applicationKeys = ['Application', 'Application Time', 'Pot Life', 'Dry Time', 'Surface Preparation']
    const specKeys = ['Specification', 'NSN', 'ECCN', 'Commodity Code']

    Object.keys(product).forEach(key => {
      const value = product[key]
      
      if (basicInfoKeys.some(k => key.includes(k))) {
        categories['Basic Info'][key] = value
      } else if (physicalKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        categories['Physical Properties'][key] = value
      } else if (performanceKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        categories['Performance Properties'][key] = value
      } else if (applicationKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        categories['Application'][key] = value
      } else if (specKeys.some(k => key.includes(k))) {
        categories['Specifications'][key] = value
      } else {
        categories['Other'][key] = value
      }
    })

    return categories
  }

  const renderAttributeValue = (value: any) => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-gray-400 italic">N/A</span>
    }
    return <span className="text-gray-800">{String(value)}</span>
  }

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto bg-gray-50">
      <h1 className="text-4xl font-bold mb-2 text-center text-blue-900">
        Smart Product Search
      </h1>
      <p className="text-center text-gray-600 mb-8">
        Search aerospace products using natural language
      </p>

      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything... (e.g., 'Show me products under $50' or 'Find red items')"
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg border border-red-300">
          <strong>Error:</strong> {error}
        </div>
      )}

      {results.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">
            Found {results.length} result{results.length !== 1 ? 's' : ''}
          </h2>
          
          <div className="space-y-4">
            {results.map((product, index) => {
              const categories = categorizeAttributes(product)
              const isExpanded = expandedProduct === index

              return (
                <div
                  key={index}
                  className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Header - Always Visible */}
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-blue-900">
                          {product['SKU'] || product['sku'] || 'N/A'}
                        </h3>
                        <p className="text-gray-700 mt-1">
                          {product['Product Name'] || product['name'] || 'No name available'}
                        </p>
                        {product['Brand'] && (
                          <p className="text-sm text-gray-600 mt-1">
                            <span className="font-semibold">Brand:</span> {product['Brand']}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setExpandedProduct(isExpanded ? null : index)}
                        className="ml-4 px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium"
                      >
                        {isExpanded ? 'Hide Details' : 'Show All Details'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="p-4">
                      {Object.entries(categories).map(([categoryName, attributes]) => {
                        const attributeCount = Object.keys(attributes).length
                        if (attributeCount === 0) return null

                        return (
                          <div key={categoryName} className="mb-6">
                            <h4 className="text-md font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-300">
                              {categoryName} ({attributeCount})
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {Object.entries(attributes).map(([key, value]) => (
                                <div key={key} className="bg-gray-50 p-2 rounded">
                                  <span className="font-semibold text-gray-700 text-sm block">
                                    {key}:
                                  </span>
                                  <span className="text-sm">
                                    {renderAttributeValue(value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loading && results.length === 0 && query && !error && (
        <div className="text-center p-8 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500 text-lg">No results found for "{query}"</p>
          <p className="text-gray-400 text-sm mt-2">Try a different search term</p>
        </div>
      )}
    </main>
  )
}
