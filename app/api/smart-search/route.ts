import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type ProductRecord = Record<string, any>

// ============================================================================
// HELPER: Generate search variations for product codes
// ============================================================================

function generateSearchVariations(productCode: string): string[] {
  const variations = new Set<string>()
  
  // Original
  variations.add(productCode)
  
  // Remove all spaces and special chars
  const cleaned = productCode.replace(/[\s\-\/®™©]/g, '')
  if (cleaned.length >= 2) {
    variations.add(cleaned)
  }
  
  // Extract just the number
  const numberMatch = productCode.match(/(\d+)/)
  if (numberMatch && numberMatch[1].length >= 2) {
    variations.add(numberMatch[1])
  }
  
  // Common patterns
  const patterns = [
    productCode.replace(/\//g, ''),           // P/S510 → PS510
    productCode.replace(/\//g, ' '),          // P/S510 → P S510
    productCode.replace(/([A-Z\/]+)(\d+)/i, '$1 $2'), // P/S510 → P/S 510
    productCode.replace(/\//g, '').replace(/([A-Z]+)(\d+)/i, '$1 $2'), // P/S510 → PS 510
    productCode.replace(/[\s\-]/g, ''),       // Remove spaces and dashes
  ]
  
  patterns.forEach(p => {
    if (p.length >= 2) {
      variations.add(p)
    }
  })
  
  // Filter out very short terms (less than 2 chars)
  return Array.from(variations).filter(v => v.length >= 2)
}

// ============================================================================
// META-QUESTION DETECTION
// ============================================================================

function detectMetaQuestion(query: string): { isMeta: boolean; type: string | null } {
  const lowerQuery = query.toLowerCase().trim()
  
  // Check if query mentions specific product (PS 870, PR-1422, etc.)
  const hasSpecificProduct = /\b(ps|p\/s|pr|korotherm|class|[a-z]{2,}\s*\d{3,}|\d{3,})\b/i.test(query)
  
  // Count questions - BUT ONLY if no specific product/filter is mentioned
  if (
    (lowerQuery.match(/^how many (products?|items?|sealants?|entries?)(\s+(are|do|in))?$/) ||
    lowerQuery.match(/^total (number of )?(products?|items?|sealants?)$/) ||
    lowerQuery.match(/^count (of )?(products?|items?|sealants?)$/)) &&
    !hasSpecificProduct
  ) {
    console.log('🎯 Detected generic count query (no specific product)')
    return { isMeta: true, type: 'count' }
  }
  
  // List families/types questions
  if (
    lowerQuery.match(/what (are the |kinds of |types of )?(families|family|types?|categories)/) ||
    lowerQuery.match(/list (all )?(families|family|types?|categories|products?)/) ||
    lowerQuery.match(/show (me )?(all )?(families|family|types?|categories)/)
  ) {
    return { isMeta: true, type: 'list' }
  }
  
  // Database info questions
  if (
    lowerQuery.match(/what('s| is) in (the |this )?database/) ||
    lowerQuery.match(/tell me about (the |this )?database/) ||
    lowerQuery.match(/database (info|information|overview|summary)/)
  ) {
    return { isMeta: true, type: 'overview' }
  }
  
  return { isMeta: false, type: null }
}

// ============================================================================
// COUNT QUERY DETECTION (for specific products)
// ============================================================================

function isCountQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim()
  return (
    lowerQuery.startsWith('how many') ||
    lowerQuery.startsWith('count') ||
    lowerQuery.includes('how many products') ||
    lowerQuery.includes('total number of')
  )
}

async function handleMetaQuestion(
  type: string,
  query: string,
  filters: any
): Promise<any> {
  console.log(`🔍 Handling meta-question type: ${type}`)
  
  try {
    if (type === 'count') {
      // Build query with filters
      let countQuery = supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
      
      // Apply user filters
      if (filters?.family) countQuery = countQuery.eq('family', filters.family)
      if (filters?.productType) countQuery = countQuery.eq('product_type', filters.productType)
      if (filters?.specification) countQuery = countQuery.eq('specification', filters.specification)
      
      // Check if query mentions specific category (e.g., "sealants")
      const lowerQuery = query.toLowerCase()
      if (lowerQuery.includes('sealant')) {
        countQuery = countQuery.or(
          'categories.ilike.%Sealants%,' +
          'family.ilike.%Sealant%,' +
          'product_type.ilike.%Sealant%,' +
          'searchable_text.ilike.%Sealant%'
        )
      }
      
      const { count, error } = await countQuery
      
      if (error) {
        console.error('❌ Error counting products:', error)
        throw error
      }
      
      console.log(`✅ Total products: ${count}`)
      
      const filterText = filters?.family || filters?.productType || filters?.specification
        ? ` with applied filters`
        : ''
      
      const categoryText = lowerQuery.includes('sealant') ? ' in Sealants category' : ''
      
      const summary = `**Product Count${categoryText}**

I found **${(count || 0).toLocaleString()} products**${categoryText}${filterText}.

${count && count > 100 ? 'You can use filters or search for specific products to narrow down the results.' : ''}`
      
      return {
        success: true,
        questionType: 'meta',
        metaType: 'count',
        summary,
        count: count || 0,
        results: []
      }
    }
    
    if (type === 'list') {
      // Get unique families, types, and specifications
      const { data: familyData } = await supabase
        .from('products')
        .select('family')
        .not('family', 'is', null)
        .limit(1000)
      
      const { data: typeData } = await supabase
        .from('products')
        .select('product_type')
        .not('product_type', 'is', null)
        .limit(1000)
      
      const families = [...new Set(familyData?.map((r: any) => r.family).filter(Boolean))].sort()
      const types = [...new Set(typeData?.map((r: any) => r.product_type).filter(Boolean))].sort()
      
      console.log(`✅ Found ${families.length} families, ${types.length} types`)
      
      const summary = `**Product Categories Overview**

**Product Families (${families.length} total):**
${families.slice(0, 20).map(f => `• ${f}`).join('\n')}
${families.length > 20 ? `\n_...and ${families.length - 20} more_` : ''}

**Product Types (${types.length} total):**
${types.slice(0, 15).map(t => `• ${t}`).join('\n')}
${types.length > 15 ? `\n_...and ${types.length - 15} more_` : ''}

You can filter by any of these categories using the filter options in the search interface.`
      
      return {
        success: true,
        questionType: 'meta',
        metaType: 'list',
        summary,
        families,
        types,
        results: []
      }
    }
    
    if (type === 'overview') {
      // Get comprehensive database overview
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
      
      const { data: familyData } = await supabase
        .from('products')
        .select('family')
        .not('family', 'is', null)
        .limit(500)
      
      const families = [...new Set(familyData?.map((r: any) => r.family).filter(Boolean))]
      
      const summary = `**Aerospace Products Database Overview**

**Total Products:** ${(count || 0).toLocaleString()} aerospace products

**Product Families:** ${families.length} unique families including ${families.slice(0, 5).join(', ')}, and more.

**Search Capabilities:**
• Natural language search across all product specifications
• Compare products side-by-side
• Filter by family, type, and specification
• AI-powered product recommendations

**Example Queries:**
• "Best sealant for firewall application"
• "Compare PS 870 vs PR 1422"
• "Show me all primers"
• "What products are in the Korotherm family?"`
      
      return {
        success: true,
        questionType: 'meta',
        metaType: 'overview',
        summary,
        totalCount: count || 0,
        familyCount: families.length,
        results: []
      }
    }
    
  } catch (error: any) {
    console.error('❌ Meta-question handler error:', error)
    throw error
  }
  
  return null
}

// ============================================================================
// HTML STRIPPING & DATA CLEANING
// ============================================================================

function stripHtml(html: string): string {
  if (typeof html !== 'string') return html
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&deg;/g, '°')
    .replace(/&reg;/g, '®')
    .replace(/&copy;/g, '©')
    .replace(/&trade;/g, '™')
    .replace(/&euro;/g, '€')
    .replace(/&pound;/g, '£')
    .replace(/&yen;/g, '¥')
    .replace(/&cent;/g, '¢')
    .replace(/&sect;/g, '§')
    .replace(/&para;/g, '¶')
    .replace(/&middot;/g, '·')
    .replace(/&bull;/g, '•')
    .replace(/&hellip;/g, '…')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&times;/g, '×')
    .replace(/&divide;/g, '÷')
    .replace(/&plusmn;/g, '±')
    .replace(/&frac14;/g, '¼')
    .replace(/&frac12;/g, '½')
    .replace(/&frac34;/g, '¾')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&([a-z]+);/gi, (match, entity) => {
      const entities: Record<string, string> = {
        'nbsp': ' ', 'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"', 'apos': "'",
        'deg': '°', 'reg': '®', 'copy': '©', 'trade': '™', 'euro': '€', 'pound': '£',
        'yen': '¥', 'cent': '¢', 'sect': '§', 'para': '¶', 'middot': '·', 'bull': '•',
        'hellip': '…', 'ndash': '–', 'mdash': '—', 'lsquo': '\u2018', 'rsquo': '\u2019',
        'ldquo': '\u201C', 'rdquo': '\u201D', 'times': '×', 'divide': '÷', 'plusmn': '±',
        'frac14': '¼', 'frac12': '½', 'frac34': '¾',
      }
      return entities[entity.toLowerCase()] || match
    })
    .trim()
}

function cleanProductData(product: ProductRecord): ProductRecord {
  const cleaned: ProductRecord = {}
  const seen = new Set<string>()
  
  const excludeFields = ['embedding', 'all_attributes']
  
  Object.keys(product).forEach(key => {
    const lowerKey = key.toLowerCase()
    
    if (seen.has(lowerKey) || excludeFields.includes(key)) return
    seen.add(lowerKey)
    
    const value = product[key]
    
    if (value === null || value === undefined || value === '') return
    
    if (typeof value === 'string') {
      const cleanedValue = stripHtml(value)
      if (cleanedValue) {
        cleaned[key] = cleanedValue
      }
    } else {
      cleaned[key] = value
    }
  })
  
  if (product.all_attributes) {
    try {
      let attributes: ProductRecord = {}
      
      if (typeof product.all_attributes === 'string') {
        attributes = JSON.parse(product.all_attributes)
      } else if (typeof product.all_attributes === 'object') {
        attributes = product.all_attributes
      }
      
      Object.keys(attributes).forEach(key => {
        const lowerKey = key.toLowerCase()
        
        if (seen.has(lowerKey)) return
        seen.add(lowerKey)
        
        const value = attributes[key]
        
        if (value === null || value === undefined || value === '') return
        
        if (typeof value === 'string') {
          const cleanedValue = stripHtml(value)
          if (cleanedValue) {
            cleaned[key] = cleanedValue
          }
        } else {
          cleaned[key] = value
        }
      })
    } catch (e) {
      console.error('Error parsing all_attributes:', e)
    }
  }
  
  return cleaned
}

// ============================================================================
// PRODUCT RELEVANCE SCORING
// ============================================================================

function scoreProductRelevance(product: ProductRecord, keywords: string[]): number {
  let score = 0
  const productText = JSON.stringify(product).toLowerCase()
  
  keywords.forEach(keyword => {
    const lowerKeyword = keyword.toLowerCase()
    const keywordCount = (productText.match(new RegExp(lowerKeyword, 'g')) || []).length
    
    const sku = (product.sku || '').toLowerCase()
    const name = (product.product_name || product.name || '').toLowerCase()
    const description = (product.description || '').toLowerCase()
    const application = (product.application || product.Application || '').toLowerCase()
    const family = (product.family || product.Family || '').toLowerCase()
    
    if (sku.includes(lowerKeyword)) score += 50
    if (name.includes(lowerKeyword)) score += 30
    if (family.includes(lowerKeyword)) score += 25
    if (application.includes(lowerKeyword)) score += 20
    if (description.includes(lowerKeyword)) score += 10
    
    score += keywordCount * 2
  })
  
  return score
}

// ============================================================================
// AI HELPER FUNCTIONS
// ============================================================================

function truncateProductForAI(product: ProductRecord, maxLength: number = 3000): string {
  let result = JSON.stringify(product, null, 2)
  
  if (result.length > maxLength) {
    const priorityFields = ['sku', 'product_name', 'name', 'description', 'color', 'colour', 'family', 'specification', 'product_type', 'application', 'use', 'features', 'benefits', 'temperature', 'resistance']
    const truncated: ProductRecord = {}
    
    priorityFields.forEach(field => {
      if (product[field]) {
        truncated[field] = product[field]
      }
    })
    
    Object.keys(product).forEach(key => {
      if (!priorityFields.includes(key)) {
        const testResult = JSON.stringify({ ...truncated, [key]: product[key] })
        if (testResult.length < maxLength) {
          truncated[key] = product[key]
        }
      }
    })
    
    result = JSON.stringify(truncated, null, 2)
  }
  
  return result
}

async function generateAISummary(query: string, products: ProductRecord[]): Promise<string> {
  try {
    const productsData = products.slice(0, 25).map(p => truncateProductForAI(p, 2000))
    const combinedData = productsData.join('\n\n---\n\n')
    
    const estimatedTokens = combinedData.length / 4
    if (estimatedTokens > 20000) {
      console.warn(`⚠️ Data too large (${estimatedTokens} tokens), reducing to top 15 products`)
      return await generateAISummary(query, products.slice(0, 15))
    }
    
    console.log(`🤖 Generating AI summary from ${products.length} products (${combinedData.length} chars)`)
    
    const summaryCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert aerospace product consultant specializing in sealants and related products. 

Your task is to provide comprehensive, insightful answers based on the product data provided.

GUIDELINES:
- Provide a clear, well-structured answer that directly addresses the user's question
- Use specific product details and technical specifications as evidence
- Explain WHY certain products are used (applications, benefits, specifications)
- When asked about "best" products, analyze ALL products and recommend based on:
  * Specific application requirements (e.g., firewall, fuel tank, pressurized cabin)
  * Technical specifications that match the use case
  * Industry standards and certifications
  * Performance characteristics
- Compare products when relevant and explain trade-offs
- Provide recommendations based on use cases
- Use bullet points for clarity when listing features or benefits
- Include technical specifications that support your explanation
- Be conversational but professional
- If asking about a product family, discuss the range of products and their differences
- Always cite specific product names/SKUs when making claims
- If multiple products are suitable, list them ALL with their specific advantages

FORMAT YOUR RESPONSE:
1. **Direct Answer** - Start with a clear answer to the question
2. **Recommended Products** - List specific products with SKUs
3. **Key Benefits/Features** - Explain why each product is suitable
4. **Technical Details** - Include relevant specifications
5. **Applications** - Explain where/how it's used
6. **Comparison** - If multiple options, explain differences and when to use each

PRODUCT DATA (${products.length} products analyzed):
${combinedData}`
        },
        {
          role: 'user',
          content: query
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })
    
    let summary = summaryCompletion.choices[0].message.content || 'Unable to generate summary'
    summary = stripHtml(summary)
    
    return summary
  } catch (error: any) {
    console.error('❌ AI summary generation error:', error.message)
    
    if (error.message?.includes('tokens') && products.length > 10) {
      console.log('🔄 Retrying with fewer products...')
      return await generateAISummary(query, products.slice(0, 10))
    }
    
    return 'Unable to generate AI summary at this time. Please review the product details below.'
  }
}

async function generateComparisonAnalysis(query: string, products: ProductRecord[], comparisonType: string): Promise<string> {
  try {
    const productsData = products.map(p => truncateProductForAI(p, 3000))
    const combinedData = productsData.join('\n\n---\n\n')
    
    console.log(`🤖 Generating comparison analysis (type: ${comparisonType})`)
    
    const comparisonCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert aerospace product consultant. You are comparing ${products.length} products.

COMPARISON TYPE: ${comparisonType}

Your task is to provide a detailed comparison analysis highlighting:
1. **Key Differences** - What makes each product unique
2. **Similarities** - What they have in common
3. **Use Cases** - When to use each product
4. **Technical Distinctions** - Important specification differences
5. **Recommendations** - Which product is best for specific applications

GUIDELINES:
- Be specific and cite actual product names/SKUs
- Highlight the most important differences first
- Explain WHY the differences matter
- Use bullet points for clarity
- Be concise but comprehensive
- Focus on practical implications for users

PRODUCTS TO COMPARE:
${combinedData}`
        },
        {
          role: 'user',
          content: query
        }
      ],
      temperature: 0.3,
      max_tokens: 1500
    })
    
    let analysis = comparisonCompletion.choices[0].message.content || 'Unable to generate comparison analysis'
    analysis = stripHtml(analysis)
    
    return analysis
  } catch (error: any) {
    console.error('❌ Comparison analysis error:', error.message)
    return 'Unable to generate comparison analysis at this time. Please review the comparison table below.'
  }
}

function detectComparisonType(products: ProductRecord[]): string {
  if (products.length < 2) return 'general'
  
  console.log(`🔍 Detecting comparison type for ${products.length} products`)
  
  const families = products.map(p => p.family || p.Family || p.product_family || '').filter(Boolean)
  const uniqueFamilies = new Set(families)
  if (uniqueFamilies.size > 1 && uniqueFamilies.size === products.length) {
    console.log(`✅ Different families detected - treating as family comparison`)
    return 'family'
  }
  
  const types = products.map(p => p.product_type || p.productType || p.type || '').filter(Boolean)
  const uniqueTypes = new Set(types)
  if (uniqueTypes.size > 1 && uniqueTypes.size === products.length) {
    console.log(`✅ Different types detected - treating as product_type comparison`)
    return 'product_type'
  }
  
  const specs = products.map(p => p.specification || p.Specification || p.spec || '').filter(Boolean)
  const uniqueSpecs = new Set(specs)
  if (uniqueSpecs.size > 1 && uniqueSpecs.size === products.length) {
    console.log(`✅ Different specifications detected - treating as specification comparison`)
    return 'specification'
  }
  
  console.log(`✅ Treating as general product comparison`)
  return 'general'
}

// ============================================================================
// DATABASE QUERY HELPERS
// ============================================================================

function buildOrConditions(filters: any[], columns: string[]): string | null {
  const orConditions = filters
    .map((filter: any) => {
      const { column, operator, value } = filter
      
      if (!columns.includes(column)) {
        console.warn(`Column "${column}" not found`)
        return null
      }
      
      switch (operator) {
        case 'eq':
          return `${column}.eq.${value}`
        case 'ilike':
          return `${column}.ilike.${value}`
        case 'gt':
          return `${column}.gt.${value}`
        case 'lt':
          return `${column}.lt.${value}`
        case 'gte':
          return `${column}.gte.${value}`
        case 'lte':
          return `${column}.lte.${value}`
        default:
          return null
      }
    })
    .filter(Boolean)
  
  return orConditions.length > 0 ? orConditions.join(',') : null
}

function applyUserFilters(dbQuery: any, filters: any, columns: string[], allProducts: any[]) {
  if (!filters) return dbQuery

  if (filters.family) {
    const familyColumns = ['family', 'Family', 'product_family', 'productFamily'].filter(col => columns.includes(col))
    
    if (familyColumns.length > 0) {
      dbQuery = dbQuery.eq(familyColumns[0], filters.family)
      console.log(`🎯 Applied family filter on column "${familyColumns[0]}": ${filters.family}`)
    } else {
      console.log(`⚠️ Family column not found in DB, will filter in memory`)
    }
  }

  if (filters.productType) {
    const typeColumns = ['product_type', 'productType', 'type', 'Type', 'category', 'Category'].filter(col => columns.includes(col))
    
    if (typeColumns.length > 0) {
      dbQuery = dbQuery.eq(typeColumns[0], filters.productType)
      console.log(`🎯 Applied product type filter on column "${typeColumns[0]}": ${filters.productType}`)
    } else {
      console.log(`⚠️ Product type column not found in DB, will filter in memory`)
    }
  }

  if (filters.specification) {
    const specColumns = ['specification', 'Specification', 'spec', 'Spec'].filter(col => columns.includes(col))
    
    if (specColumns.length > 0) {
      dbQuery = dbQuery.eq(specColumns[0], filters.specification)
      console.log(`🎯 Applied specification filter on column "${specColumns[0]}": ${filters.specification}`)
    } else {
      console.log(`⚠️ Specification column not found in DB, will filter in memory`)
    }
  }

  return dbQuery
}

function filterProductsInMemory(products: any[], filters: any): any[] {
  if (!filters) return products

  return products.filter(product => {
    let matches = true

    if (filters.family) {
      const familyValue = product.family || product.Family || product.product_family || product.productFamily
      const attrFamily = product.all_attributes?.family || product.all_attributes?.Family
      
      if (familyValue !== filters.family && attrFamily !== filters.family) {
        matches = false
      }
    }

    if (filters.productType) {
      const typeValue = product.product_type || product.productType || product.type || product.Type || product.category || product.Category
      const attrType = product.all_attributes?.product_type || product.all_attributes?.type
      
      if (typeValue !== filters.productType && attrType !== filters.productType) {
        matches = false
      }
    }

    if (filters.specification) {
      const specValue = product.specification || product.Specification || product.spec || product.Spec
      const attrSpec = product.all_attributes?.specification || product.all_attributes?.spec
      
      if (specValue !== filters.specification && attrSpec !== filters.specification) {
        matches = false
      }
    }

    return matches
  })
}

// ============================================================================
// MAIN POST HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, filters, getFilterOptions } = body

    // ========================================================================
    // FILTER OPTIONS REQUEST
    // ========================================================================
    
    if (query === '__GET_FILTER_OPTIONS__' || getFilterOptions === true) {
      console.log('📋 Loading filter options...')
      
      try {
        const { data: products, error } = await supabase
          .from('products')
          .select('*')
          .limit(10000)

        if (error) {
          throw new Error(`Database error: ${error.message}`)
        }

        const families = new Set<string>()
        const productTypes = new Set<string>()
        const specifications = new Set<string>()

        products?.forEach((product: any) => {
          const familyValue = product.family || product.Family || product.product_family || product.productFamily
          if (familyValue && String(familyValue).trim()) {
            families.add(String(familyValue).trim())
          }

          const typeValue = product.product_type || product.productType || product.type || product.Type || product.category || product.Category
          if (typeValue && String(typeValue).trim()) {
            productTypes.add(String(typeValue).trim())
          }

          const specValue = product.specification || product.Specification || product.spec || product.Spec
          if (specValue && String(specValue).trim()) {
            specifications.add(String(specValue).trim())
          }

          if (product.all_attributes) {
            try {
              let attributes: any = typeof product.all_attributes === 'string' 
                ? JSON.parse(product.all_attributes) 
                : product.all_attributes

              const attrFamily = attributes.family || attributes.Family || attributes.product_family || attributes.productFamily
              if (attrFamily && String(attrFamily).trim()) {
                families.add(String(attrFamily).trim())
              }

              const attrType = attributes.product_type || attributes.productType || attributes.type || attributes.Type
              if (attrType && String(attrType).trim()) {
                productTypes.add(String(attrType).trim())
              }

              const attrSpec = attributes.specification || attributes.Specification || attributes.spec || attributes.Spec
              if (attrSpec && String(attrSpec).trim()) {
                specifications.add(String(attrSpec).trim())
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        })

        const familiesArray = Array.from(families).sort()
        const productTypesArray = Array.from(productTypes).sort()
        const specificationsArray = Array.from(specifications).sort()

        console.log(`✅ Filter options loaded: ${familiesArray.length} families, ${productTypesArray.length} types, ${specificationsArray.length} specs`)

        return NextResponse.json({
          success: true,
          filterOptions: {
            families: familiesArray,
            productTypes: productTypesArray,
            specifications: specificationsArray
          }
        })
      } catch (error: any) {
        console.error('❌ Error loading filter options:', error)
        return NextResponse.json({
          success: false,
          filterOptions: { 
            families: [], 
            productTypes: [], 
            specifications: [] 
          },
          error: error.message
        })
      }
    }

    // ========================================================================
    // VALIDATE QUERY
    // ========================================================================
    
    if (!query) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }

    console.log('🔍 User query:', query)
    console.log('🎯 Applied filters:', filters)

    // ========================================================================
    // CHECK FOR META-QUESTIONS (count, list, overview)
    // ========================================================================
    
    const metaCheck = detectMetaQuestion(query)
    if (metaCheck.isMeta && metaCheck.type) {
      console.log(`🎯 Detected meta-question type: ${metaCheck.type}`)
      const metaResult = await handleMetaQuestion(metaCheck.type, query, filters)
      if (metaResult) {
        return NextResponse.json(metaResult)
      }
    }

    // ========================================================================
    // STEP 1: GET DATABASE SCHEMA
    // ========================================================================
    
    const { data: sampleData, error: schemaError } = await supabase
      .from('products')
      .select('*')
      .limit(3)

    if (schemaError) {
      throw new Error(`Schema error: ${schemaError.message}`)
    }

    const columns = sampleData && sampleData.length > 0 
      ? Object.keys(sampleData[0]) 
      : []

    const samplePreview = sampleData?.slice(0, 2).map((item: ProductRecord) => {
      const preview: ProductRecord = {}
      Object.keys(item).forEach(key => {
        const value = item[key]
        if (typeof value === 'string' && value.length > 100) {
          preview[key] = value.substring(0, 100) + '...'
        } else {
          preview[key] = value
        }
      })
      return preview
    })

    console.log('📊 Available columns:', columns.length)

    // ========================================================================
    // STEP 2: USE GPT-4O-MINI TO UNDERSTAND QUERY
    // ========================================================================
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a smart database search assistant for aerospace products. Analyze user queries and generate appropriate database filters.

DATABASE SCHEMA:
Columns: ${columns.join(', ')}

SAMPLE DATA STRUCTURE:
${JSON.stringify(samplePreview, null, 2)}

USER APPLIED FILTERS:
${filters ? JSON.stringify(filters, null, 2) : 'None'}

IMPORTANT NOTES:
- The "searchable_text" column contains ALL product information (flattened from all_attributes)
- Product identifiers can be in "sku", "product_name", "name", or "family" columns
- Products may have variants (e.g., "P/S 870 Class A", "P/S 870 Class B", "P/S 870 Class C")
- When user asks for a product family (e.g., "PS 870" or "P/S510"), show ALL variants
- Product codes may have spaces, slashes, or special characters (e.g., "P/S 510®", "PS510", "P/S-510")
- For product name queries, search JUST THE NUMBER to catch all variations
- If user has applied filters (family, productType, specification), incorporate them into the search

QUESTION TYPE DETECTION:

1. **COUNT QUESTIONS** (how many, count, total number):
 - Set questionType: "count"
 - Extract JUST THE NUMBER from product name
 - Search in: sku, product_name, family, searchable_text
 - Use "any" searchType (OR logic)
 - Set limit: 500 (reasonable for counting)

2. **ANALYTICAL QUESTIONS** (why, how, what makes, explain, tell me about, what is, advantages, benefits, uses, best, recommend, which product):
 - Set questionType: "analytical"
 - These require AI-generated summaries based on product data
 - Examples: "Why use Korotherm?", "What are the benefits of PS 870?", "Which product is best for firewall?", "What is P/S510?"
 - **CRITICAL: For product family queries (e.g., "what is P/S510"), extract JUST THE NUMBER:**
   - "P/S510" → search for "510"
   - "PS 870" → search for "870"
   - "PR-1422" → search for "1422"
 - Search in: sku, product_name, name, family, searchable_text
 - Use "any" searchType (OR logic)
 - Set limit: 50 (manageable for AI analysis)

3. **SINGLE PRODUCT QUERY** (e.g., "PS 870", "PR-148", "P/S510"):
 - Set questionType: "list"
 - Extract JUST THE NUMBER: "PS 870" → "870", "P/S510" → "510"
 - Search in: sku, product_name, name, family, searchable_text
 - Use "any" searchType to find ALL variants
 - Set limit: 500

4. **COMPARISON QUERIES** ("difference", "compare", "vs", "versus", "between"):
 - Set questionType: "comparison"
 - Extract product identifiers (just numbers)
 - Create filters for EACH product
 - Search in: sku, product_name, name, family, searchable_text
 - Use "any" searchType (OR logic)
 - Set limit: 500

5. **ATTRIBUTE QUESTIONS** ("what is the [attribute] of [product]"):
 - Set questionType: "specific_ai"
 - Extract just the number from product name
 - Let AI extract the specific attribute from results
 - Set limit: 5

6. **APPLICATION-BASED QUERIES** ("best for [application]", "product for [use]"):
 - Set questionType: "analytical"
 - Extract PRIMARY keyword (e.g., "firewall", "fuel tank")
 - Search in: sku, product_name, name, description, application, searchable_text
 - Set limit: 100
 - Use "any" searchType

RESPONSE FORMAT (JSON):
{
  "filters": [
    {
      "column": "column_name",
      "operator": "eq" | "ilike",
      "value": "value"
    }
  ],
  "searchType": "all" | "any",
  "questionType": "list" | "count" | "specific_ai" | "comparison" | "analytical",
  "attributeQuestion": "extracted question",
  "compareProducts": ["product1", "product2"],
  "limit": null | number,
  "searchKeywords": ["keyword1", "keyword2"]
}

CRITICAL RULES:
- For product name queries, extract JUST THE NUMBER (e.g., "P/S510" → "510")
- This catches all variations: "P/S 510®", "PS510", "P/S-510", "PS 510"
- Always include "family" column in searches
- Use wildcards: %510% will match anywhere in the text
- For "what is [product]" queries, use questionType: "analytical"
- ALWAYS set a limit (500 for count/list, 100 for analytical, 50 for specific)

EXAMPLES:

Query: "how many products are ps 890"
Response:
{
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%890%"},
    {"column": "product_name", "operator": "ilike", "value": "%890%"},
    {"column": "family", "operator": "ilike", "value": "%890%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%890%"}
  ],
  "searchType": "any",
  "questionType": "count",
  "limit": 500,
  "searchKeywords": ["890", "PS 890", "P/S 890"]
}

Query: "what is P/S510 sealant"
Response:
{
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%510%"},
    {"column": "product_name", "operator": "ilike", "value": "%510%"},
    {"column": "family", "operator": "ilike", "value": "%510%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%510%"}
  ],
  "searchType": "any",
  "questionType": "analytical",
  "limit": 50,
  "searchKeywords": ["510", "P/S 510", "PS510"]
}

Query: "Tell me about PS 870"
Response:
{
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%870%"},
    {"column": "product_name", "operator": "ilike", "value": "%870%"},
    {"column": "family", "operator": "ilike", "value": "%870%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%870%"}
  ],
  "searchType": "any",
  "questionType": "analytical",
  "limit": 50,
  "searchKeywords": ["870", "PS 870", "P/S 870"]
}

Query: "Which product is best for firewall sealant?"
Response:
{
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%firewall%"},
    {"column": "product_name", "operator": "ilike", "value": "%firewall%"},
    {"column": "description", "operator": "ilike", "value": "%firewall%"},
    {"column": "application", "operator": "ilike", "value": "%firewall%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%firewall%"}
  ],
  "searchType": "any",
  "questionType": "analytical",
  "limit": 100,
  "searchKeywords": ["firewall"]
}`
        },
        {
          role: 'user',
          content: query
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 2000
    })

    let searchParams
    try {
      searchParams = JSON.parse(completion.choices[0].message.content || '{"filters": [], "searchType": "any", "questionType": "list", "limit": 500}')
    } catch (parseError) {
      console.error('❌ Failed to parse GPT response:', completion.choices[0].message.content)
      searchParams = { filters: [], searchType: "any", questionType: "list", limit: 500 }
    }

    console.log('📋 Parsed search params:', JSON.stringify(searchParams, null, 2))

    if (!searchParams.filters || !Array.isArray(searchParams.filters)) {
      searchParams.filters = []
    }
    if (!searchParams.searchType) {
      searchParams.searchType = "any"
    }
    if (!searchParams.questionType) {
      searchParams.questionType = "list"
    }

    // ========================================================================
    // STEP 3: BUILD SUPABASE QUERY
    // ========================================================================
    
    let dbQuery: any = supabase.from('products').select('*')

    dbQuery = applyUserFilters(dbQuery, filters, columns, [])

    if (searchParams.filters.length > 0) {
      console.log(`🔍 Applying ${searchParams.filters.length} filters with ${searchParams.searchType} logic`)
      
      if (searchParams.searchType === "any") {
        const orConditionString = buildOrConditions(searchParams.filters, columns)
        
        if (orConditionString) {
          dbQuery = dbQuery.or(orConditionString)
          console.log('✅ OR conditions applied:', orConditionString)
        }
      } else {
        const validFilters = searchParams.filters.filter((filter: any) => 
          columns.includes(filter.column)
        )
        
        console.log(`✅ Valid filters: ${validFilters.length}/${searchParams.filters.length}`)
        
        for (const filter of validFilters) {
          const { column, operator, value } = filter
          console.log(`  → ${column} ${operator} ${value}`)
          
          switch (operator) {
            case 'eq':
              dbQuery = dbQuery.eq(column, value)
              break
            case 'ilike':
              dbQuery = dbQuery.ilike(column, value)
              break
            case 'gt':
              dbQuery = dbQuery.gt(column, value)
              break
            case 'lt':
              dbQuery = dbQuery.lt(column, value)
              break
            case 'gte':
              dbQuery = dbQuery.gte(column, value)
              break
            case 'lte':
              dbQuery = dbQuery.lte(column, value)
              break
          }
        }
      }
    } else {
      console.log('📦 No search filters - will return filtered by user selections')
    }

    if (searchParams.orderBy?.column && columns.includes(searchParams.orderBy.column)) {
      console.log(`📊 Ordering by: ${searchParams.orderBy.column}`)
      dbQuery = dbQuery.order(
        searchParams.orderBy.column,
        { ascending: searchParams.orderBy.ascending ?? true }
      )
    }

    // ========================================================================
    // APPLY LIMIT & EXECUTE QUERY (except for count queries)
    // ========================================================================
    
    let cleanedResults: ProductRecord[] = []
    
    if (!isCountQuery(query)) {
      const limit = searchParams.limit || 100
      dbQuery = dbQuery.limit(limit)
      console.log(`📊 Applying limit: ${limit}`)
      
      console.log('🔍 Executing database query...')
      
      const { data: products, error: queryError } = await dbQuery
      
      if (queryError) {
        console.error('❌ Query error:', queryError)
        throw new Error(`Database query failed: ${queryError.message}`)
      }
      
      console.log(`✅ Found ${products?.length || 0} products`)
      
      // Apply in-memory filters if needed
      let filteredProducts = products || []
      if (filters && (filters.family || filters.productType || filters.specification)) {
        const beforeFilter = filteredProducts.length
        filteredProducts = filterProductsInMemory(filteredProducts, filters)
        console.log(`🔍 In-memory filter: ${beforeFilter} → ${filteredProducts.length} products`)
      }
      
      // Clean and score products
      cleanedResults = filteredProducts.map((p: any) => cleanProductData(p))
      
      // Score and sort by relevance if we have search keywords
      if (searchParams.searchKeywords && searchParams.searchKeywords.length > 0) {
        cleanedResults = cleanedResults
          .map((p: ProductRecord) => ({
            ...p,
            _relevanceScore: scoreProductRelevance(p, searchParams.searchKeywords)
          }))
          .sort((a: any, b: any) => b._relevanceScore - a._relevanceScore)
          .map((p: any) => {
            const { _relevanceScore, ...rest } = p
            return rest
          })
        
        console.log(`✅ Sorted ${cleanedResults.length} products by relevance`)
      }
    }

    // ========================================================================
    // OPTIMIZE FOR COUNT QUERIES - USE SUPABASE COUNT
    // ========================================================================

    if (isCountQuery(query)) {
      console.log('🔢 Count query detected - using Supabase count feature')
      searchParams.questionType = "count"
      
      // Build count query with timeout protection
      const countPromise = (async () => {
        let countQuery: any = supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
        
        // Apply user filters
        countQuery = applyUserFilters(countQuery, filters, columns, [])
        
        // Apply search filters
        if (searchParams.filters.length > 0) {
          if (searchParams.searchType === "any") {
            const orConditionString = buildOrConditions(searchParams.filters, columns)
            if (orConditionString) {
              countQuery = countQuery.or(orConditionString)
              console.log('✅ OR conditions applied for count:', orConditionString)
            }
          } else {
            const validFilters = searchParams.filters.filter((filter: any) => 
              columns.includes(filter.column)
            )
            
            for (const filter of validFilters) {
              const { column, operator, value } = filter
              
              switch (operator) {
                case 'eq':
                  countQuery = countQuery.eq(column, value)
                  break
                case 'ilike':
                  countQuery = countQuery.ilike(column, value)
                  break
                case 'gt':
                  countQuery = countQuery.gt(column, value)
                  break
                case 'lt':
                  countQuery = countQuery.lt(column, value)
                  break
                case 'gte':
                  countQuery = countQuery.gte(column, value)
                  break
                case 'lte':
                  countQuery = countQuery.lte(column, value)
                  break
              }
            }
          }
        }
        
        return await countQuery
      })()
      
      // Add timeout (30 seconds)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Count query timeout')), 30000)
      )
      
      try {
        const { count, error: countError } = await Promise.race([countPromise, timeoutPromise]) as any
        
        if (countError) {
          console.error('❌ Count query error:', countError)
          throw new Error(`Count error: ${countError.message}`)
        }
        
        console.log(`✅ Total count: ${count}`)
        
        // =====================================================================
        // FETCH ALL MATCHING PRODUCTS (handle pagination for > 1000 results)
        // =====================================================================
        
        const maxResults = Math.min(count || 0, 3000) // Cap at 3000 for performance
        const batchSize = 1000 // Supabase max per request
        let allProducts: any[] = []
        
        // Calculate number of batches needed
        const numBatches = Math.ceil(maxResults / batchSize)
        
        console.log(`📦 Fetching ${maxResults} products in ${numBatches} batch(es)...`)
        
        // Fetch in batches
        for (let i = 0; i < numBatches; i++) {
          const offset = i * batchSize
          const limit = Math.min(batchSize, maxResults - offset)
          
          let batchQuery = supabase.from('products').select('*')
          batchQuery = applyUserFilters(batchQuery, filters, columns, [])
          
          if (searchParams.filters.length > 0 && searchParams.searchType === "any") {
            const orConditionString = buildOrConditions(searchParams.filters, columns)
            if (orConditionString) {
              batchQuery = batchQuery.or(orConditionString)
            }
          }
          
          // Apply pagination
          batchQuery = batchQuery.range(offset, offset + limit - 1)
          
          const { data: batchData, error: fetchError } = await batchQuery
          
          if (fetchError) {
            console.error(`❌ Error fetching batch ${i + 1}:`, fetchError)
            throw new Error(`Fetch error: ${fetchError.message}`)
          }
          
          if (batchData && batchData.length > 0) {
            allProducts = allProducts.concat(batchData)
            console.log(`✅ Fetched batch ${i + 1}/${numBatches}: ${batchData.length} products (total: ${allProducts.length})`)
          }
          
          // Stop if we got fewer results than expected (no more data)
          if (!batchData || batchData.length < limit) {
            break
          }
        }
        
        console.log(`✅ Total fetched: ${allProducts.length} products`)
        
        // Clean the products
        cleanedResults = allProducts.map((p: any) => cleanProductData(p))
        
        // Get unique families for summary
        const families = new Set<string>()
        cleanedResults.forEach((p: any) => {
          const family = p.family || p.Family || p.product_family
          if (family) families.add(family)
        })
        
        const familyList = Array.from(families).slice(0, 10) // Show top 10 families
        const productContext = searchParams.searchKeywords?.join(', ') || 'matching products'
        
        const familyText = familyList.length > 0 
          ? `\n\n**Product Families Found:**\n${familyList.map(f => `• ${f}`).join('\n')}${families.size > 10 ? `\n_...and ${families.size - 10} more families_` : ''}`
          : ''
        
        const limitWarning = count && count > maxResults 
          ? `\n\n⚠️ **Note:** Showing first ${maxResults.toLocaleString()} results for performance. Use filters to narrow down your search.`
          : ''
        
        const summary = `**Product Count: ${productContext}**

I found **${(count || 0).toLocaleString()} product(s)** matching "${productContext}".${familyText}${limitWarning}

You can view all ${cleanedResults.length.toLocaleString()} products in the results table below.`
        
        return NextResponse.json({
          success: true,
          questionType: "count",
          summary: summary,
          count: count || 0,
          results: cleanedResults,
          totalResults: count || 0,
          displayedResults: cleanedResults.length,
          families: Array.from(families),
          limitApplied: count && count > maxResults
        })
        
      } catch (timeoutError: any) {
        console.error('❌ Query timeout:', timeoutError)
        
        return NextResponse.json({
          success: false,
          error: 'Query took too long to execute. Please try a more specific search or use filters.',
          timeout: true
        }, { status: 408 })
      }
    }

    // ========================================================================
    // STEP 4: HANDLE ANALYTICAL QUESTIONS
    // ========================================================================
    
    if (searchParams.questionType === "analytical") {
      console.log(`🤖 Analytical mode - generating AI summary from ${cleanedResults.length} products`)
      
      const aiSummary = await generateAISummary(query, cleanedResults)
      
      return NextResponse.json({
        success: true,
        questionType: "analytical",
        summary: aiSummary,
        results: cleanedResults,
        count: cleanedResults.length,
        message: `Analysis based on ${cleanedResults.length} product(s)`
      })
    }

    // ========================================================================
    // STEP 5: HANDLE COMPARISON QUESTIONS
    // ========================================================================
    
    if (searchParams.questionType === "comparison") {
      console.log(`🔄 Comparison mode - found ${cleanedResults.length} products`)
      
      if (cleanedResults.length >= 2) {
        const compareProducts = searchParams.compareProducts || []
        const groupedProducts: ProductRecord[] = []
        
        compareProducts.forEach((term: string) => {
          const cleanTerm = term.replace(/[\s-]/g, '').toLowerCase()
          
          const matchedProduct = cleanedResults.find((p: ProductRecord) => {
            const productStr = JSON.stringify(p).toLowerCase().replace(/[\s-]/g, '')
            return productStr.includes(cleanTerm) && !groupedProducts.includes(p)
          })
          
          if (matchedProduct) {
            groupedProducts.push(matchedProduct)
          }
        })
        
        const productsToCompare = groupedProducts.length >= 2 
          ? groupedProducts.slice(0, 2) 
          : cleanedResults.slice(0, 2)
        
        const comparisonType = detectComparisonType(productsToCompare)
        console.log(`📊 Comparison type detected: ${comparisonType}`)
        
        console.log(`🤖 Generating AI comparison analysis`)
        const comparisonSummary = await generateComparisonAnalysis(query, productsToCompare, comparisonType)
        
        return NextResponse.json({
          success: true,
          questionType: "comparison",
          products: productsToCompare,
          compareProducts: searchParams.compareProducts || [],
          comparisonType: comparisonType,
          comparisonSummary: comparisonSummary,
          totalFound: cleanedResults.length
        })
      } else {
        return NextResponse.json({
          success: true,
          questionType: "list",
          results: cleanedResults,
          count: cleanedResults.length,
          message: `Found only ${cleanedResults.length} product(s). Need at least 2 products for comparison.`
        })
      }
    }

    // ========================================================================
    // STEP 6: HANDLE SPECIFIC AI QUESTIONS
    // ========================================================================
    
    if (searchParams.questionType === "specific_ai" && cleanedResults.length > 0) {
      const product = cleanedResults[0]
      const attributeQuestion = searchParams.attributeQuestion || query
      
      console.log('🤖 Using AI to extract answer from product data')
      
      try {
        const productDataString = truncateProductForAI(product, 8000)
        
        const answerCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a product information assistant. Extract the relevant answer from the product data.

RULES:
- Answer directly and concisely
- If information not found, say "Information not available in product data"
- Extract ALL relevant information
- Format lists with bullet points using "•"
- Remove all HTML tags
- Convert HTML entities (e.g., &deg; to °, &reg; to ®)
- Be specific and complete

PRODUCT DATA:
${productDataString}`
            },
            {
              role: 'user',
              content: attributeQuestion
            }
          ],
          temperature: 0.1,
          max_tokens: 1000
        })
        
        let answer = answerCompletion.choices[0].message.content || 'Information not available'
        answer = stripHtml(answer)
        
        return NextResponse.json({
          success: true,
          questionType: "specific",
          answer: answer,
          extractedData: {
            sku: product.sku || product.product_name || product.name || 'N/A',
            question: attributeQuestion
          },
          fullProduct: product
        })
      } catch (aiError: any) {
        console.error('❌ AI extraction error:', aiError.message)
        return NextResponse.json({
          success: true,
          questionType: "list",
          results: cleanedResults.slice(0, 1),
          count: 1,
          message: "Found product but couldn't extract specific answer. Showing full details."
        })
      }
    }

    // ========================================================================
    // DEFAULT: RETURN CLEANED RESULTS
    // ========================================================================
    
    return NextResponse.json({
      success: true,
      questionType: "list",
      results: cleanedResults,
      count: cleanedResults.length
    })

  } catch (error: any) {
    console.error('❌ Smart search error:', error)
    
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: 500 }
    )
  }
}
