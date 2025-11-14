import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type ProductRecord = Record<string, any>

// Enhanced HTML stripping with comprehensive entity handling
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

// Helper function to clean and flatten product data
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

// NEW: Score and rank products by relevance
function scoreProductRelevance(product: ProductRecord, keywords: string[]): number {
  let score = 0
  const productText = JSON.stringify(product).toLowerCase()
  
  keywords.forEach(keyword => {
    const lowerKeyword = keyword.toLowerCase()
    const keywordCount = (productText.match(new RegExp(lowerKeyword, 'g')) || []).length
    
    // Higher weight for keywords in important fields
    const sku = (product.sku || '').toLowerCase()
    const name = (product.product_name || product.name || '').toLowerCase()
    const description = (product.description || '').toLowerCase()
    const application = (product.application || product.Application || '').toLowerCase()
    
    if (sku.includes(lowerKeyword)) score += 50
    if (name.includes(lowerKeyword)) score += 30
    if (application.includes(lowerKeyword)) score += 20
    if (description.includes(lowerKeyword)) score += 10
    
    // General occurrence bonus
    score += keywordCount * 2
  })
  
  return score
}

// Helper to truncate product data for AI processing
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

// Helper function to build query string for OR conditions
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

// Helper to apply user filters with flexible column matching
function applyUserFilters(dbQuery: any, filters: any, columns: string[], allProducts: any[]) {
  if (!filters) return dbQuery

  // For family filter
  if (filters.family) {
    const familyColumns = ['family', 'Family', 'product_family', 'productFamily'].filter(col => columns.includes(col))
    
    if (familyColumns.length > 0) {
      dbQuery = dbQuery.eq(familyColumns[0], filters.family)
      console.log(`🎯 Applied family filter on column "${familyColumns[0]}": ${filters.family}`)
    } else {
      console.log(`⚠️ Family column not found in DB, will filter in memory`)
    }
  }

  // For product type filter
  if (filters.productType) {
    const typeColumns = ['product_type', 'productType', 'type', 'Type', 'category', 'Category'].filter(col => columns.includes(col))
    
    if (typeColumns.length > 0) {
      dbQuery = dbQuery.eq(typeColumns[0], filters.productType)
      console.log(`🎯 Applied product type filter on column "${typeColumns[0]}": ${filters.productType}`)
    } else {
      console.log(`⚠️ Product type column not found in DB, will filter in memory`)
    }
  }

  // For specification filter
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

// Helper to filter products in memory (fallback when DB columns don't exist)
function filterProductsInMemory(products: any[], filters: any): any[] {
  if (!filters) return products

  return products.filter(product => {
    let matches = true

    // Check family
    if (filters.family) {
      const familyValue = product.family || product.Family || product.product_family || product.productFamily
      const attrFamily = product.all_attributes?.family || product.all_attributes?.Family
      
      if (familyValue !== filters.family && attrFamily !== filters.family) {
        matches = false
      }
    }

    // Check product type
    if (filters.productType) {
      const typeValue = product.product_type || product.productType || product.type || product.Type || product.category || product.Category
      const attrType = product.all_attributes?.product_type || product.all_attributes?.type
      
      if (typeValue !== filters.productType && attrType !== filters.productType) {
        matches = false
      }
    }

    // Check specification
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

// NEW: Generate AI summary from multiple products
async function generateAISummary(query: string, products: ProductRecord[]): Promise<string> {
  try {
    // Limit to top 50 products and use aggressive truncation
    const productsData = products.slice(0, 25).map(p => truncateProductForAI(p, 2000))
    const combinedData = productsData.join('\n\n---\n\n')
    
    // Safety check for token limits
    const estimatedTokens = combinedData.length / 4 // rough estimate
    if (estimatedTokens > 20000) {
      console.warn(`⚠️ Data too large (${estimatedTokens} tokens), reducing to top 15 products`)
      const reducedData = products.slice(0, 15).map(p => truncateProductForAI(p, 1500))
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
    
    // If token limit error, try with fewer products
    if (error.message?.includes('tokens') && products.length > 10) {
      console.log('🔄 Retrying with fewer products...')
      return await generateAISummary(query, products.slice(0, 10))
    }
    
    return 'Unable to generate AI summary at this time. Please review the product details below.'
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, filters, getFilterOptions } = body

    // Handle filter options request
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
          // Extract family
          const familyValue = product.family || product.Family || product.product_family || product.productFamily
          if (familyValue && String(familyValue).trim()) {
            families.add(String(familyValue).trim())
          }

          // Extract product type
          const typeValue = product.product_type || product.productType || product.type || product.Type || product.category || product.Category
          if (typeValue && String(typeValue).trim()) {
            productTypes.add(String(typeValue).trim())
          }

          // Extract specification
          const specValue = product.specification || product.Specification || product.spec || product.Spec
          if (specValue && String(specValue).trim()) {
            specifications.add(String(specValue).trim())
          }

          // Also check in all_attributes
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

    // Regular search flow continues below
    if (!query) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }

    console.log('🔍 User query:', query)
    console.log('🎯 Applied filters:', filters)

    // Step 1: Get table schema with sample data
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

    // Step 2: Use GPT-4o-mini to understand the query
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
- Product identifiers can be in "sku", "product_name", or "name" columns
- Use SPECIFIC searches for better performance
- Products may have variants (e.g., "P/S 870 Class A", "P/S 870 Class B", "P/S 870 Class C")
- When user asks for a product family (e.g., "PS 870"), show ALL variants
- If user has applied filters (family, productType, specification), incorporate them into the search

QUESTION TYPE DETECTION:

1. **ANALYTICAL QUESTIONS** (why, how, what makes, explain, tell me about, advantages, benefits, uses, best, recommend, which product):
   - Set questionType: "analytical"
   - These require AI-generated summaries based on product data
   - Examples: "Why use Korotherm?", "What are the benefits of PS 870?", "Which product is best for firewall?"
   - **CRITICAL: For application-based queries, use TARGETED search:**
     - Primary keyword: Main application term (e.g., "firewall")
     - Search in: sku, product_name, name, description, application fields
     - Use "any" searchType (OR logic)
     - Set limit: 100 (manageable for AI analysis)
   - For specific product family queries (e.g., "tell me about PS 870"), search for that product name

2. **SINGLE PRODUCT QUERY** (e.g., "PS 870", "PR-148"):
   - Set questionType: "list"
   - Search broadly: %PS%870% will match "PS870", "PS-870", "PS 870", "P/S 870"
   - Search in: sku, product_name, name, searchable_text
   - Use "any" searchType to find ALL variants
   - Set limit: null (to show all variants like Class A, B, C)

3. **COMPARISON QUERIES** ("difference", "compare", "vs", "versus", "between"):
   - Set questionType: "comparison"
   - Extract product identifiers
   - Create filters for EACH product with wildcards
   - Search in: sku, product_name, name, searchable_text
   - Use "any" searchType (OR logic)
   - Set limit: null

4. **ATTRIBUTE QUESTIONS** ("what is the [attribute] of [product]"):
   - Set questionType: "specific_ai"
   - Search broadly for product identifier
   - Let AI extract the specific attribute from results
   - Set limit: 5

5. **EXACT SKU LOOKUP**:
   - Use "eq" operator only if SKU format is exact (e.g., "0870A00276012PT")
   - Otherwise use "ilike" with wildcards

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
  "questionType": "list" | "specific_ai" | "comparison" | "analytical",
  "attributeQuestion": "extracted question",
  "compareProducts": ["product1", "product2"],
  "limit": null | number,
  "searchKeywords": ["keyword1", "keyword2"]
}

CRITICAL RULES FOR ANALYTICAL QUERIES:
- For "best for [application]" queries, extract PRIMARY keyword (e.g., "firewall")
- Search in sku, product_name, name, description, application columns
- Set limit: 100 (to avoid database timeout and token limits)
- Use "any" searchType for OR logic
- Include searchKeywords array with extracted application terms
- Be SPECIFIC - don't use overly broad terms like "high temperature" alone

EXAMPLES:

Query: "Which product is best for firewall sealant?"
Response:
{
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%firewall%"},
    {"column": "product_name", "operator": "ilike", "value": "%firewall%"},
    {"column": "name", "operator": "ilike", "value": "%firewall%"},
    {"column": "description", "operator": "ilike", "value": "%firewall%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%firewall%"}
  ],
  "searchType": "any",
  "questionType": "analytical",
  "limit": 100,
  "searchKeywords": ["firewall"]
}

Query: "Tell me about PS 870"
Response:
{
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%PS%870%"},
    {"column": "product_name", "operator": "ilike", "value": "%PS%870%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%PS%870%"}
  ],
  "searchType": "any",
  "questionType": "analytical",
  "limit": 50,
  "searchKeywords": ["PS 870"]
}

Query: "show me a product for firewall"
Response:
{
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%firewall%"},
    {"column": "product_name", "operator": "ilike", "value": "%firewall%"},
    {"column": "description", "operator": "ilike", "value": "%firewall%"},
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
      searchParams = JSON.parse(completion.choices[0].message.content || '{"filters": [], "searchType": "any", "questionType": "list", "limit": null}')
    } catch (parseError) {
      console.error('❌ Failed to parse GPT response:', completion.choices[0].message.content)
      searchParams = { filters: [], searchType: "any", questionType: "list", limit: null }
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

    // Step 3: Build Supabase query
    let dbQuery: any = supabase.from('products').select('*')

    // Apply user-selected filters
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

    // Apply smart limits based on question type
    if (searchParams.questionType === "analytical") {
      const limit = searchParams.limit || 100
      dbQuery = dbQuery.limit(limit)
      console.log(`🔢 Analytical query - limiting to ${limit} products for performance`)
    } else if (searchParams.limit !== undefined && searchParams.limit !== null && searchParams.limit > 0) {
      dbQuery = dbQuery.limit(searchParams.limit)
      console.log(`🔢 Applying limit: ${searchParams.limit}`)
    } else {
      console.log(`🔢 No limit applied - fetching all matching results`)
    }

    let { data, error } = await dbQuery

    if (error) {
      console.error('❌ Supabase error:', error)
      throw new Error(`Database error: ${error.message}`)
    }

    console.log(`✅ Query returned ${data?.length || 0} results`)

    // Apply in-memory filtering if needed
    if (data && data.length > 0 && filters) {
      const beforeFilter = data.length
      data = filterProductsInMemory(data, filters)
      console.log(`🔄 In-memory filter: ${beforeFilter} → ${data.length} products`)
    }

    // NEW: For analytical queries, rank by relevance and take top results
    if (searchParams.questionType === "analytical" && data && data.length > 0 && searchParams.searchKeywords) {
      console.log(`🎯 Ranking ${data.length} products by relevance...`)
      
      const scoredProducts = data.map((product: ProductRecord) => ({
        product,
        score: scoreProductRelevance(product, searchParams.searchKeywords)
      }))
      
      scoredProducts.sort((a, b) => b.score - a.score)
      
      // Take top 50 most relevant products
      data = scoredProducts.slice(0, 50).map(item => item.product)
      
      console.log(`✅ Selected top ${data.length} most relevant products`)
    }

    // FALLBACK: If no results, try simpler search
    if ((!data || data.length === 0) && searchParams.filters.length > 0) {
      console.log('🔄 No results found, trying fallback search...')
      
      const searchTerms = new Set<string>()
      
      // Extract search terms from filters
      searchParams.filters.forEach((filter: any) => {
        if (filter.value) {
          const cleanTerm = filter.value.replace(/%/g, '').replace(/[\s-]/g, '')
          if (cleanTerm.length > 2) {
            searchTerms.add(cleanTerm)
          }
        }
      })
      
      // Also use searchKeywords if provided
      if (searchParams.searchKeywords && Array.isArray(searchParams.searchKeywords)) {
        searchParams.searchKeywords.forEach((keyword: string) => {
          if (keyword && keyword.length > 2) {
            searchTerms.add(keyword)
          }
        })
      }
      
      if (searchTerms.size > 0) {
        const fallbackFilters: string[] = []
        Array.from(searchTerms).forEach(term => {
          fallbackFilters.push(`searchable_text.ilike.%${term}%`)
          fallbackFilters.push(`sku.ilike.%${term}%`)
          fallbackFilters.push(`product_name.ilike.%${term}%`)
          fallbackFilters.push(`name.ilike.%${term}%`)
        })
        
        let fallbackQuery = supabase
          .from('products')
          .select('*')
          .or(fallbackFilters.join(','))
          .limit(100)
        
        fallbackQuery = applyUserFilters(fallbackQuery, filters, columns, [])
        
        const fallbackResult = await fallbackQuery
        
        if (!fallbackResult.error && fallbackResult.data && fallbackResult.data.length > 0) {
          console.log(`✅ Fallback search found ${fallbackResult.data.length} results`)
          data = filterProductsInMemory(fallbackResult.data, filters)
        }
      }
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        success: true,
        questionType: "list",
        results: [],
        count: 0,
        message: "No products found matching your query. Try using different keywords or partial product names."
      })
    }

    const cleanedResults = data.map((product: ProductRecord) => cleanProductData(product))

    // Step 4: Handle ANALYTICAL questions
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

    // Step 5: Handle comparison questions
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
        
        return NextResponse.json({
          success: true,
          questionType: "comparison",
          products: productsToCompare,
          compareProducts: searchParams.compareProducts || [],
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

    // Step 6: Handle AI-powered specific questions
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

    // Default: return cleaned results
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
