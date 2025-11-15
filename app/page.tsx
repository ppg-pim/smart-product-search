'use client'

import { useState, useEffect } from 'react'

export default function Home() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [specificAnswer, setSpecificAnswer] = useState<any>(null)
  const [comparisonData, setComparisonData] = useState<any>(null)
  const [analyticalData, setAnalyticalData] = useState<any>(null)
  const [hasSearched, setHasSearched] = useState(false)
  
  const [selectedFamily, setSelectedFamily] = useState('')
  const [selectedProductType, setSelectedProductType] = useState('')
  const [selectedSpecification, setSelectedSpecification] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  
  const [familyOptions, setFamilyOptions] = useState<string[]>([])
  const [productTypeOptions, setProductTypeOptions] = useState<string[]>([])
  const [specificationOptions, setSpecificationOptions] = useState<string[]>([])
  const [loadingFilters, setLoadingFilters] = useState(true)

  useEffect(() => {
    loadFilterOptionsInline()
  }, [])

  const loadFilterOptionsInline = async () => {
    setLoadingFilters(true)
    try {
      const response = await fetch('/api/smart-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          query: '__GET_FILTER_OPTIONS__',
          getFilterOptions: true
        }),
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.filterOptions) {
          setFamilyOptions(data.filterOptions.families || [])
          setProductTypeOptions(data.filterOptions.productTypes || [])
          setSpecificationOptions(data.filterOptions.specifications || [])
          console.log('✅ Loaded filter options:', data.filterOptions)
        }
      } else {
        console.error('Failed to load filter options:', response.status)
      }
    } catch (err) {
      console.error('Failed to load filter options:', err)
    } finally {
      setLoadingFilters(false)
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResults([])
    setSpecificAnswer(null)
    setComparisonData(null)
    setAnalyticalData(null)
    setHasSearched(true)

    try {
      const response = await fetch('/api/smart-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          query,
          filters: {
            family: selectedFamily,
            productType: selectedProductType,
            specification: selectedSpecification
          }
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Search failed')
      }

      if (data.questionType === 'analytical') {
        setAnalyticalData(data)
        setResults(data.results || [])
      }
      else if (data.questionType === 'comparison') {
        setComparisonData(data)
        setResults(data.products || [])
      }
      else if (data.questionType === 'specific') {
        setSpecificAnswer(data)
        if (data.fullProduct) {
          setResults([data.fullProduct])
        }
      } 
      else {
        setResults(data.results || [])
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const clearFilters = () => {
    setSelectedFamily('')
    setSelectedProductType('')
    setSelectedSpecification('')
  }

  const hasActiveFilters = selectedFamily || selectedProductType || selectedSpecification

  const isEmpty = (value: any): boolean => {
    if (value === null || value === undefined) return true
    if (typeof value === 'string' && value.trim() === '') return true
    if (Array.isArray(value) && value.length === 0) return true
    return false
  }

  const groupAttributes = (product: any) => {
    const headerFields = ['sku', 'name', 'product_name', 'productname', 'description', 'product_description']
    const excludeFields = ['embedding', 'created_at', 'updated_at', 'createdat', 'updatedat', 'searchable_text', 'searchabletext', 'searchable']
    
    const header: any = {}
    const other: any = {}
    const seen = new Set<string>()

    Object.entries(product).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase()
      
      if (seen.has(lowerKey) || excludeFields.includes(lowerKey) || isEmpty(value)) return
      seen.add(lowerKey)
      
      if (headerFields.includes(lowerKey)) {
        header[key] = value
      } else {
        other[key] = value
      }
    })

    return { header, other }
  }

  const formatFieldName = (key: string): string => {
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
    
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  }

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

  const getAllKeys = (products: any[]) => {
    const allKeys = new Set<string>()
    const seenLowerKeys = new Set<string>()
    const excludeFields = ['embedding', 'created_at', 'updated_at', 'createdat', 'updatedat', 'searchable_text', 'searchabletext']
    
    products.forEach(product => {
      Object.keys(product).forEach(key => {
        const lowerKey = key.toLowerCase()
        if (!seenLowerKeys.has(lowerKey) && !excludeFields.includes(lowerKey) && !isEmpty(product[key])) {
          allKeys.add(key)
          seenLowerKeys.add(lowerKey)
        }
      })
    })
    return Array.from(allKeys)
  }

  const isDifferent = (key: string, products: any[]) => {
    const values = products.map(p => p[key])
    return new Set(values).size > 1
  }

  const renderAnalyticalSummary = () => {
    if (!analyticalData) return null

    return (
      <div className="mb-8">
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-500 rounded-lg overflow-hidden shadow-lg">
          <div className="p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="ml-4 flex-1">
                <h2 className="text-2xl font-bold text-green-900 mb-2">AI Analysis</h2>
                <p className="text-green-700 text-sm">
                  Based on analysis of {analyticalData.count} product(s)
                </p>
              </div>
            </div>
            
            <div className="prose prose-green max-w-none">
              <div 
                className="text-gray-800 leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ 
                  __html: analyticalData.summary
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-green-900">$1</strong>')
                    .replace(/\n\n/g, '</p><p class="mt-4">')
                    .replace(/^/, '<p>')
                    .replace(/$/, '</p>')
                    .replace(/• /g, '<li class="ml-4">')
                    .replace(/<\/p><p class="mt-4"><li/g, '</p><ul class="list-disc ml-6 mt-2 space-y-1"><li')
                    .replace(/<li class="ml-4">(.*?)<\/p>/g, '<li class="ml-4">$1</li></ul><p class="mt-4">')
                }}
              />
            </div>
          </div>
        </div>

        {analyticalData.count > 0 && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-blue-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-blue-900">
                  {analyticalData.count} product reference{analyticalData.count !== 1 ? 's' : ''} available below
                </span>
              </div>
              <button
                onClick={() => {
                  const element = document.getElementById('product-references')
                  element?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 underline"
              >
                View Details →
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderComparisonSummary = () => {
    if (!comparisonData || !comparisonData.comparisonSummary) return null

    return (
      <div className="mb-8">
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-l-4 border-purple-500 rounded-lg overflow-hidden shadow-lg">
          <div className="p-6">
            <div className="flex items-start mb-4">
              <div className="flex-shrink-0">
                <svg className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="ml-4 flex-1">
                <h2 className="text-2xl font-bold text-purple-900 mb-2">Comparison Analysis</h2>
                <p className="text-purple-700 text-sm">
                  {comparisonData.comparisonType === 'sku' ? 'SKU-to-SKU Comparison' : `Comparing ${comparisonData.products?.length || 0} products`}
                </p>
              </div>
            </div>
            
            <div className="prose prose-purple max-w-none">
              <div 
                className="text-gray-800 leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ 
                  __html: comparisonData.comparisonSummary
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-purple-900">$1</strong>')
                    .replace(/\n\n/g, '</p><p class="mt-4">')
                    .replace(/^/, '<p>')
                    .replace(/$/, '</p>')
                    .replace(/• /g, '<li class="ml-4">')
                    .replace(/<\/p><p class="mt-4"><li/g, '</p><ul class="list-disc ml-6 mt-2 space-y-1"><li')
                    .replace(/<li class="ml-4">(.*?)<\/p>/g, '<li class="ml-4">$1</li></ul><p class="mt-4">')
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-blue-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm font-medium text-blue-900">
                Detailed comparison table available below
              </span>
            </div>
            <button
              onClick={() => {
                const element = document.getElementById('comparison-table')
                element?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 underline"
            >
              View Table →
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderComparison = () => {
    if (!comparisonData || !comparisonData.products || comparisonData.products.length < 2) {
      return null
    }

    const products = comparisonData.products
    const allKeys = getAllKeys(products)
    
    const priorityFields = ['sku', 'product_name', 'productname', 'name', 'description', 'product_description']
    
    const priority = allKeys.filter(k => priorityFields.includes(k.toLowerCase()))
    const technical = allKeys.filter(k => !priorityFields.includes(k.toLowerCase()))

    return (
      <div className="mb-8" id="comparison-table">
        <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-6 rounded-lg">
          <h2 className="text-2xl font-bold text-blue-900 mb-2">Product Comparison</h2>
          <p className="text-blue-700">Comparing {products.length} products - Differences are highlighted</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 w-1/4 sticky left-0 bg-gray-50 z-10">
                    Attribute
                  </th>
                  {products.map((product: any, idx: number) => (
                    <th 
                      key={idx} 
                      className="px-6 py-4 text-left text-sm font-semibold"
                      style={{ color: '#0078a9' }}
                    >
                      Product {idx + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {priority.map((key) => {
                  const different = isDifferent(key, products)
                  return (
                    <tr 
                      key={key} 
                      className={`border-b border-gray-200 ${different ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-6 py-4 text-sm font-semibold text-gray-700 sticky left-0 bg-white z-10">
                        <div className="flex items-center gap-2">
                          {formatFieldName(key)}
                          {different && (
                            <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full" title="Different values"></span>
                          )}
                        </div>
                      </td>
                      {products.map((product: any, idx: number) => (
                        <td 
                          key={idx} 
                          className={`px-6 py-4 text-sm text-gray-900 ${different ? 'font-semibold' : ''}`}
                        >
                          {formatValue(key, product[key]) || '-'}
                        </td>
                      ))}
                    </tr>
                  )
                })}

                {technical.length > 0 && (
                  <>
                    <tr className="bg-gray-100">
                      <td colSpan={products.length + 1} className="px-6 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: '#0078a9' }}>
                        Technical Specifications
                      </td>
                    </tr>

                    {technical.map((key) => {
                      const different = isDifferent(key, products)
                      return (
                        <tr 
                          key={key} 
                          className={`border-b border-gray-200 ${different ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}
                        >
                          <td className="px-6 py-3 text-sm text-gray-700 sticky left-0 bg-white z-10">
                            <div className="flex items-center gap-2">
                              {formatFieldName(key)}
                              {different && (
                                <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full" title="Different values"></span>
                              )}
                            </div>
                          </td>
                          {products.map((product: any, idx: number) => (
                            <td 
                              key={idx} 
                              className={`px-6 py-3 text-sm text-gray-900 ${different ? 'font-semibold' : ''}`}
                            >
                              {formatValue(key, product[key]) || '-'}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
          <span className="inline-block w-3 h-3 bg-yellow-50 border border-yellow-200 rounded"></span>
          <span>Highlighted rows indicate differences between products</span>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto bg-gray-50">
      <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
        <h1 className="text-4xl font-bold mb-2 text-center" style={{ color: '#0078a9' }}>
          Sealants Smart Search
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Search products using natural language
        </p>

        <form onSubmit={handleSearch}>
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask anything... (e.g., 'Why use Korotherm sealant?', 'Compare PS 870 vs PR-148')"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0078a9] focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="px-6 py-3 border-2 rounded-lg font-medium transition-colors"
              style={{ 
                borderColor: '#0078a9',
                color: showFilters ? '#fff' : '#0078a9',
                backgroundColor: showFilters ? '#0078a9' : 'transparent'
              }}
            >
              <svg className="w-5 h-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
              {hasActiveFilters && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                  {[selectedFamily, selectedProductType, selectedSpecification].filter(Boolean).length}
                </span>
              )}
            </button>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-8 py-3 text-white rounded-lg hover:opacity-90 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
              style={{ backgroundColor: '#0078a9' }}
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {showFilters && (
            <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold" style={{ color: '#0078a9' }}>
                  Filter Options {loadingFilters && <span className="text-sm font-normal text-gray-500">(Loading...)</span>}
                </h3>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-sm text-red-600 hover:text-red-800 font-medium"
                  >
                    Clear All Filters
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Family ({familyOptions.length} options)
                  </label>
                  <select
                    value={selectedFamily}
                    onChange={(e) => setSelectedFamily(e.target.value)}
                    disabled={loadingFilters}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0078a9] focus:border-transparent disabled:bg-gray-100"
                  >
                    <option value="">All Families</option>
                    {familyOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Type ({productTypeOptions.length} options)
                  </label>
                  <select
                    value={selectedProductType}
                    onChange={(e) => setSelectedProductType(e.target.value)}
                    disabled={loadingFilters}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0078a9] focus:border-transparent disabled:bg-gray-100"
                  >
                    <option value="">All Types</option>
                    {productTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Specification ({specificationOptions.length} options)
                  </label>
                  <select
                    value={selectedSpecification}
                    onChange={(e) => setSelectedSpecification(e.target.value)}
                    disabled={loadingFilters}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0078a9] focus:border-transparent disabled:bg-gray-100"
                  >
                    <option value="">All Specifications</option>
                    {specificationOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {hasActiveFilters && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="text-sm text-gray-600">Active filters:</span>
                  {selectedFamily && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      Family: {selectedFamily}
                      <button
                        type="button"
                        onClick={() => setSelectedFamily('')}
                        className="ml-2 text-blue-600 hover:text-blue-800"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {selectedProductType && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                      Type: {selectedProductType}
                      <button
                        type="button"
                        onClick={() => setSelectedProductType('')}
                        className="ml-2 text-green-600 hover:text-green-800"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {selectedSpecification && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                      Spec: {selectedSpecification}
                      <button
                        type="button"
                        onClick={() => setSelectedSpecification('')}
                        className="ml-2 text-purple-600 hover:text-purple-800"
                      >
                        ×
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          <strong>Error:</strong> {error}
        </div>
      )}

      {analyticalData && renderAnalyticalSummary()}

      {comparisonData && comparisonData.comparisonSummary && renderComparisonSummary()}

      {comparisonData && renderComparison()}

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
              <p className="text-green-800 text-lg">{specificAnswer.answer}</p>
              
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

      {results.length > 0 && !comparisonData && (
        <div id="product-references">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-semibold" style={{ color: '#0078a9' }}>
              {analyticalData ? 'Product References' : specificAnswer ? 'Full Product Details' : `Found ${results.length} ${results.length === 1 ? 'result' : 'results'}`}
            </h2>
            {analyticalData && (
              <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                {results.length} product{results.length !== 1 ? 's' : ''} analyzed
              </span>
            )}
          </div>

          <div className="space-y-6">
            {results.map((product, index) => {
              const { header, other } = groupAttributes(product)
              
              return (
                <div
                  key={index}
                  className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {Object.keys(header).length > 0 && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200 p-6">
                      {Object.entries(header).map(([key, value]) => {
                        const lowerKey = key.toLowerCase()
                        
                        if (lowerKey === 'sku') {
                          return (
                            <div key={key} className="mb-3">
                              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">SKU</span>
                              <h3 className="text-2xl font-bold mt-1" style={{ color: '#0078a9' }}>
                                {String(value)}
                              </h3>
                            </div>
                          )
                        }
                        
                        if (lowerKey === 'name' || lowerKey === 'product_name' || lowerKey === 'productname') {
                          return (
                            <div key={key} className="mb-3">
                              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Product Name</span>
                              <h4 className="text-xl font-semibold text-gray-900 mt-1">
                                {String(value)}
                              </h4>
                            </div>
                          )
                        }
                        
                        if (lowerKey === 'description' || lowerKey === 'product_description') {
                          return (
                            <div key={key} className="mt-3">
                              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Description</span>
                              <p className="text-gray-700 mt-1 leading-relaxed">
                                {String(value)}
                              </p>
                            </div>
                          )
                        }
                        
                        return null
                      })}
                    </div>
                  )}

                  {Object.keys(other).length > 0 && (
                    <div className="p-6">
                      <h4 className="text-lg font-semibold mb-4" style={{ color: '#0078a9' }}>
                        Technical Specifications
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(other).map(([key, value]) => (
                          <div 
                            key={key} 
                            className="border-l-2 border-gray-200 pl-4 py-2 hover:border-blue-400 transition-colors"
                          >
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                              {formatFieldName(key)}
                            </div>
                            <div className="text-sm text-gray-900 font-medium">
                              {formatValue(key, value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {Object.keys(header).length === 0 && Object.keys(other).length === 0 && (
                    <div className="p-6 text-center text-gray-500">
                      No displayable data available for this product
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#0078a9]"></div>
          <p className="mt-4 text-gray-600">Searching products...</p>
          {query && (
            <p className="mt-2 text-sm text-gray-500">
              You are searching: <span className="font-semibold" style={{ color: '#0078a9' }}>{query}</span>
            </p>
          )}
        </div>
      )}

      {!loading && hasSearched && !error && results.length === 0 && !specificAnswer && !comparisonData && !analyticalData && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No results found</h3>
          <p className="mt-2 text-sm text-gray-500">
            Try adjusting your search query or filters
          </p>
        </div>
      )}
    </main>
  )
}