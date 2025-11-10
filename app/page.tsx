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

  // Decode HTML entities
  const decodeHtmlEntities = (text: string): string => {
    if (typeof text !== 'string') return text
    
    const textarea = document.createElement('textarea')
    textarea.innerHTML = text
    return textarea.value
  }

  // Group attributes by category with comprehensive categorization
  const categorizeAttributes = (product: any) => {
    const categories: { [key: string]: { [key: string]: any } } = {
      'Basic Information': {},
      'Physical Properties': {},
      'Application & Usage': {},
      'Performance & Testing': {},
      'Spray Gun Settings': {},
      'Material Compatibility': {},
      'Temperature & Environmental': {},
      'Compliance & Specifications': {},
      'Packaging & Logistics': {},
      'Other Attributes': {}
    }

    // Define comprehensive category mappings
    const categoryMap: { [key: string]: string[] } = {
      'Basic Information': [
        'SKU', 'product_name', 'Product Name', 'Product Description', 'Brand', 'Color', 
        'Color: Part A', 'Color: Part B', 'Color Part C', 'Chemistry', 'Categories', 
        'Product Type', 'Product Model', 'Appearance', 'Family', 'Groups', 'Class',
        'Material & Chemistry', 'Status', 'OEM or After Market'
      ],
      'Physical Properties': [
        'Viscosity', 'Specific Gravity', 'Specific Gravity for WEB', 'Flash Point', 
        'Density', 'Dry Film Density', 'Dry Film Weight', 'Weight', 'Product Weight',
        'Gross Weight', 'Nonvolatile Content (%)', 'Pigment Content', 'Solubility in Water',
        'Soluble Chromate (%)', 'Fineness of Grind', 'Flow', 'VOC - US Only - MIXED (EPA Method 24)',
        'Dielectric Constant', 'Dielectric Strength', 'Volume Resitivity', 'Insulation Resistance',
        'Power Factor', 'Electrical Contact Resistance', 'Surface Resistivity'
      ],
      'Application & Usage': [
        'Application', 'Application Time', 'Application Life', 'Application Life & Cure Time Condition',
        'Pot Life Mixed Product', 'Assembly Time', 'Mixing Instructions', 'Mixing Ratio', 
        'Mix Ratio (by Volume)', 'Equipment', 'Equipment Cleaning', 'Surface Preparation',
        'Surface Preparation & Pretreatments', 'Instruction for Use', 'Recommended Thickness',
        'Recommended Dry Film Thickness', 'Theoretical Coverage', 'Paintability', 
        'Repairability to Itself', 'Reparability to Polysulfide (AMS-S-8802)', 'Overcoat Time',
        'Time to Coats', 'Retarder - Wet Edge', 'Retarder - Time Between Coats',
        'Thinner - Wet Edge', 'Thinner - Time Between Coats'
      ],
      'Performance & Testing': [
        'Adhesion', 'Tensile Strength', 'Shear Strength', 'Lap Shear Strength', 'Peel Strength',
        'Tear Strength', 'Elongation', 'Flexibility', 'Low Temperature Flexibility',
        'Compression Set', 'Cure Time Durometer', 'Cure Time to 30 Shore A Durometer',
        'Ultimate Cure Hardness (Shore A Durometer)', 'Hydrolytic Stability / Hardness Durometer A',
        'Dry Hard', 'Dry Time Pot Mold', 'Dry to Walk', 'Set to Touch', 'Tack Free Time (Max.)',
        'Mold Release Time', 'Reinjection Time', 'Full Cure', 'Standard Cure',
        'Slump - 1 / Inches (mm)', 'Slump - 2 / Inches (mm)', 'Slump - Initial / Inches (mm)',
        'Squeeze Test', 'Plastometer Extrusion Force', 'Shaving and Sanding',
        'Corrosion (Miscellaneous)', 'Salt Spray (fog) Test', 'Crazing', 'Flammability',
        'Flame Resistance Overload', 'Flame Exposure', 'Rain Erosion Resistance',
        'Thermal Rupture Resistance', 'Sound Velocity Sea Water', 'Fungus Resistance',
        'Ozone Resistance', 'Moisture Absorption %', 'Water Vapor Permeability',
        'Volume Shrinkage, %', 'Weight Loss (%)', 'Swell (%)'
      ],
      'Spray Gun Settings': [
        'Airless Spray Gun Atomization Pressure Cap', 'Airless Spray Gun Flow Rate',
        'Airless Spray Gun Pot Pressure', 'Airless Spray Gun Tip Size',
        'Airmix Air Spray Gun Atomization Pressure Cap', 'Airmix Air Spray Gun Flow Rate',
        'Airmix Air Spray Gun Pot Pressure', 'Airmix Air Spray Gun Tip Size',
        'Conventional Air Spray Gun - Flow Rate',
        'Electrostatic Air Assisted Airless Spray Gun - Flow Rate',
        'Electrostatic Air Spray Gun - Flow Rate',
        'High Volume Low Pressure Spray Gun (HVLP) - Atomization Pressure at the Cap',
        'High Volume Low Pressure Spray Gun (HVLP) - Flow Rate',
        'High Volume Low Pressure Spray Gun (HVLP) - Pot Pressure',
        'High Volume Low Pressure Spray Gun (HVLP) - Tip Size',
        'Low Volume Low Pressure Spray Gun (LVLP) - Automation Pressure Cap',
        'Low Volume Low Pressure Spray Gun (LVLP) - Flow Rate',
        'Low Volume Low Pressure Spray Gun (LVLP) - Pot Pressure',
        'Low Volume Low Pressure Spray gun (LVLP) - Tip Size'
      ],
      'Material Compatibility': [
        'AMS 2471 Anodized Aluminum / 7 days soak in AMS 2629 Type 1 at 140F',
        'AMS 2471 Aluminum / 7 days soak in 50% AMS 2629 Type 1 & 50% 3% NaCl Salt water for 7 days at 140F',
        'AMS 4901 Titanium (Comp C) / 7 days soak in AMS 2629 Type 1 at 140F',
        'AMS 4901 Titanium / 7 days soak in 50% AMS 2629 Type 1 & 50% 3% NaCl Salt water for 7 days at 140F',
        'AMS 5516 Stainless Steel / 7 days soak in AMS 2629 Type 1 at 140F',
        'AMS 5516 Steel / 7 days soak in 50% AMS 2629 Type 1 & 50% 3% NaCl Salt water for 7 days at 140F',
        'AMS-C-27725 IFT Coating / 7 days soak in AMS 2629 Type 1 at 140F',
        'AMS-C-27725 IFT / 7 days soak in 50% AMS 2629 Type 1 & 50% 3% NaCl Salt water for 7 days at 140F',
        'AMS-G-25667 Glass / Standard Cure only, no conditioning',
        'AMS-P-83310 Polycarbonate / Standard Cure only, no conditioning',
        'AS4/3501-6 Graphite Epoxy / 7 days sink in AMS 2629 Type 1 at 140F',
        'AS4/3501-6 Epoxy / 7 days sink in 50% AMS 2629 Type 1 & 50% 3% NaCl Salt water for 7 days at 140F',
        'IM7/5250-5 Graphite BMI / 7 days sink in AMS 2629 Type 1 at 140F',
        'IM7/5250-5 BMI / 7 days sink in 50% AMS 2629 Type 1 & 50% 3% NaCl Salt water for 7 days at 140F',
        'MIL-C-5541 Chemical Conversion Coating on Aluminum / 7 days sink in AMS 2629 Type 1 at 140F',
        'MIL-C-5541 Aluminum / 7 days sink in 50% AMS 2629 Type 1 & 50% 3% NaCl Salt water for 7 days at 140F',
        'MIL-PRF-8184 Acrylic / Standard Cure only, no conditioning',
        'MIL-PRF-23377 Military Epoxy Primer / 7 days in 3% NaCl Salt water at 140F',
        'MIL-PRF-85285 Polyurethane Topcoat / 7 days in 3% NaCl Salt water at 140F',
        'MIL-PRF-85582 Epoxy Primer / 7 days in 3% NaCl Salt water at 140F',
        'Product Compatibility', 'Effect on Finishes'
      ],
      'Temperature & Environmental': [
        'Temperature Range', 'Temperature Range for WEB', 'Service Temperature',
        'Exposure to Dry Heat', 'Exposure to Heat', 'Resistance to Heat',
        'Heat Reversion Resistance', 'Cryogenic Performance',
        'Humidity Resistance', 'Resistance To Thermal Expansion',
        'Avgas / Gasoline', 'Jet Fuel Kerosene', 'Hydraulic Fluid', 
        'Turbine Oil Lubricants', 'Water / Salt Water', 'De-Icing Agents',
        'Resistance to Hydrocarbons', 'Resistance to Other Fluids', 'Solvents'
      ],
      'Compliance & Specifications': [
        'Specification', 'NSN', 'ECCN', 'Commodity Code', 'Export Classification',
        'Country of Origin', 'Health Precautions', 'Enabled'
      ],
      'Packaging & Logistics': [
        'Packaging Options', 'Packaging Type', 'Container Color', 'Container Size in Kit',
        'KIT Size', 'Product Size & Dimension', 'Seal Cap Size', 'Shelf Life (Storage life)',
        'Recommended Thawing Procedure', 'UOM', 'Price (US Dollar)', 'Currency',
        'Sellable on e-Commerce', 'Market'
      ]
    }

    // Categorize each attribute
    Object.keys(product).forEach(key => {
      const value = product[key]
      let categorized = false
      
      // Find the appropriate category
      for (const [category, keywords] of Object.entries(categoryMap)) {
        if (keywords.includes(key)) {
          categories[category][key] = value
          categorized = true
          break
        }
      }
      
      // If not categorized, put in "Other Attributes"
      if (!categorized) {
        categories['Other Attributes'][key] = value
      }
    })

    // Remove empty categories
    Object.keys(categories).forEach(category => {
      if (Object.keys(categories[category]).length === 0) {
        delete categories[category]
      }
    })

    return categories
  }

  const renderAttributeValue = (value: any) => {
    if (value === null || value === undefined || value === '') {
      return <span className="text-gray-400 italic">N/A</span>
    }
    
    // Decode HTML entities
    const decodedValue = decodeHtmlEntities(String(value))
    
    return <span className="text-gray-800">{decodedValue}</span>
  }

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto bg-gray-50">
      <h1 className="text-4xl font-bold mb-2 text-center text-blue-900">
        🔍 Smart Product Search
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
            placeholder="Ask anything... (e.g., 'Show me all products', 'Find SKU 0870A00276012PT', 'PPG products')"
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors"
          >
            {loading ? '⏳ Searching...' : '🔍 Search'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg border border-red-300">
          <strong>❌ Error:</strong> {error}
        </div>
      )}

      {results.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">
            ✅ Found {results.length} result{results.length !== 1 ? 's' : ''}
          </h2>
          
          <div className="space-y-4">
            {results.map((product, index) => {
              const categories = categorizeAttributes(product)
              const isExpanded = expandedProduct === index
              
              // Get product name from product_name or fallback
              const productName = decodeHtmlEntities(
                product['product_name'] || 
                product['Product Name'] || 
                product['name'] || 
                'No name available'
              )

              return (
                <div
                  key={index}
                  className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Header - Always Visible */}
                  <div className="p-5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-blue-900 mb-1">
                          {product['SKU'] || product['sku'] || 'N/A'}
                        </h3>
                        <p className="text-gray-700 text-lg mb-2">
                          {productName}
                        </p>
                        <div className="flex flex-wrap gap-3 text-sm">
                          {product['Brand'] && (
                            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium">
                              🏢 {product['Brand']}
                            </span>
                          )}
                          {product['Color'] && (
                            <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full font-medium">
                              🎨 {decodeHtmlEntities(product['Color'])}
                            </span>
                          )}
                          {product['Chemistry'] && (
                            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">
                              🧪 {product['Chemistry']}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setExpandedProduct(isExpanded ? null : index)}
                        className="ml-4 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm"
                      >
                        {isExpanded ? '▲ Hide Details' : '▼ Show All Details'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="p-5">
                      {Object.entries(categories).map(([categoryName, attributes]) => {
                        const attributeCount = Object.keys(attributes).length
                        if (attributeCount === 0) return null

                        return (
                          <div key={categoryName} className="mb-6 last:mb-0">
                            <h4 className="text-lg font-bold text-gray-800 mb-3 pb-2 border-b-2 border-blue-200 flex items-center justify-between">
                              <span>{categoryName}</span>
                              <span className="text-sm font-normal text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                                {attributeCount} attribute{attributeCount !== 1 ? 's' : ''}
                              </span>
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {Object.entries(attributes).map(([key, value]) => (
                                <div key={key} className="bg-gray-50 p-3 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-colors">
                                  <div className="font-semibold text-gray-700 text-sm mb-1">
                                    {key}
                                  </div>
                                  <div className="text-sm">
                                    {renderAttributeValue(value)}
                                  </div>
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
        <div className="text-center p-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-gray-500 text-xl mb-2">No results found for "{query}"</p>
          <p className="text-gray-400 text-sm">Try a different search term or check your spelling</p>
        </div>
      )}
    </main>
  )
}
