import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type ProductRecord = Record<string, any>

// Enhanced HTML stripping with better entity handling
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
    .replace(/&deg;/g, '°')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&([a-z]+);/gi, (match, entity) => {
      const entities: Record<string, string> = {
        'nbsp': ' ',
        'amp': '&',
        'lt': '<',
        'gt': '>',
        'quot': '"',
        'deg': '°',
      }
      return entities[entity.toLowerCase()] || match
    })
    .trim()
}

// Helper function to clean and flatten product data
function cleanProductData(product: ProductRecord): ProductRecord {
  const cleaned: ProductRecord = {}
  
  const excludeFields = ['embedding', 'all_attributes']
  
  Object.keys(product).forEach(key => {
    if (excludeFields.includes(key)) return
    
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

// Helper to truncate product data for AI processing (avoid token limits)
function truncateProductForAI(product: ProductRecord, maxLength: number = 8000): string {
  let result = JSON.stringify(product, null, 2)
  
  if (result.length > maxLength) {
    // Prioritize important fields
    const priorityFields = ['sku', 'product_name', 'name', 'description', 'color', 'colour']
    const truncated: ProductRecord = {}
    
    priorityFields.forEach(field => {
      if (product[field]) {
        truncated[field] = product[field]
      }
    })
    
    // Add other fields until we reach the limit
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

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()

    if (!query) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }

    console.log('🔍 User query:', query)

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

IMPORTANT NOTES:
- The "searchable_text" column contains ALL product information (flattened from all_attributes)
- Product identifiers can be in "sku", "product_name", or "name" columns
- Use BROAD searches with "ilike" and wildcards for maximum accuracy
- ALWAYS search "searchable_text" column for product attributes
- Product names may appear with or without spaces/dashes (e.g., "PS870", "PS-870", "PS 870")

SEARCH STRATEGY FOR HIGH ACCURACY:
1. **COMPARISON QUERIES** ("difference", "compare", "vs", "versus", "between"):
   - Set questionType: "comparison"
   - Extract product identifiers (SKU, name, or partial match)
   - Create MULTIPLE filter variations for each product (with/without spaces, dashes)
   - Search in: sku, product_name, name, searchable_text
   - Use "any" searchType (OR logic) to find all matches
   - CRITICAL: Create filters for EACH product separately with wildcards

2. **ATTRIBUTE QUESTIONS** ("what is the [attribute] of [product]"):
   - Set questionType: "specific_ai"
   - Search broadly in searchable_text for product identifier
   - Let AI extract the specific attribute from results

3. **EXACT SKU LOOKUP**:
   - Use "eq" operator only if SKU format is exact (e.g., "0870A00276012PT")
   - Otherwise use "ilike" with wildcards

4. **PARTIAL/FUZZY SEARCH**:
   - Always use "ilike" with "%term%" wildcards
   - Search multiple columns: sku, product_name, name, searchable_text
   - Use "any" searchType for broader results

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
  "questionType": "list" | "specific_ai" | "comparison",
  "attributeQuestion": "extracted question",
  "compareProducts": ["product1", "product2"],
  "limit": null | number
}

EXAMPLES:

Query: "what is the difference between ps 870 and ps 890"
Response: {
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%PS%870%"},
    {"column": "product_name", "operator": "ilike", "value": "%PS%870%"},
    {"column": "name", "operator": "ilike", "value": "%PS%870%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%PS%870%"},
    {"column": "sku", "operator": "ilike", "value": "%PS%890%"},
    {"column": "product_name", "operator": "ilike", "value": "%PS%890%"},
    {"column": "name", "operator": "ilike", "value": "%PS%890%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%PS%890%"}
  ],
  "searchType": "any",
  "questionType": "comparison",
  "compareProducts": ["PS 870", "PS 890"],
  "limit": null
}

Query: "what is the different PR-148 and PR-187"
Response: {
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%PR-148%"},
    {"column": "sku", "operator": "ilike", "value": "%PR148%"},
    {"column": "product_name", "operator": "ilike", "value": "%PR-148%"},
    {"column": "product_name", "operator": "ilike", "value": "%PR148%"},
    {"column": "name", "operator": "ilike", "value": "%PR-148%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%PR-148%"},
    {"column": "sku", "operator": "ilike", "value": "%PR-187%"},
    {"column": "sku", "operator": "ilike", "value": "%PR187%"},
    {"column": "product_name", "operator": "ilike", "value": "%PR-187%"},
    {"column": "product_name", "operator": "ilike", "value": "%PR187%"},
    {"column": "name", "operator": "ilike", "value": "%PR-187%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%PR-187%"}
  ],
  "searchType": "any",
  "questionType": "comparison",
  "compareProducts": ["PR-148", "PR-187"],
  "limit": null
}

Query: "What is the color of PR-1440M Class B"
Response: {
  "filters": [
    {"column": "searchable_text", "operator": "ilike", "value": "%PR-1440M%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%Class B%"}
  ],
  "searchType": "all",
  "questionType": "specific_ai",
  "attributeQuestion": "What is the color?",
  "limit": 5
}

Query: "what is the cure time of 0821XXXXXX651SKCS"
Response: {
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%0821%651SKCS%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%0821%651SKCS%"}
  ],
  "searchType": "any",
  "questionType": "specific_ai",
  "attributeQuestion": "What is the cure time?",
  "limit": 5
}

Query: "Compare 0142XCLRCA001BT and 0142XCLRCA001BTBEL"
Response: {
  "filters": [
    {"column": "sku", "operator": "eq", "value": "0142XCLRCA001BT"},
    {"column": "sku", "operator": "eq", "value": "0142XCLRCA001BTBEL"}
  ],
  "searchType": "any",
  "questionType": "comparison",
  "compareProducts": ["0142XCLRCA001BT", "0142XCLRCA001BTBEL"],
  "limit": null
}

CRITICAL RULES FOR COMPARISONS:
- For "difference between X and Y", create separate filters for EACH product
- Use wildcards: %PS%870% will match "PS870", "PS-870", "PS 870", "APS870B"
- Search ALL relevant columns (sku, product_name, name, searchable_text) for EACH product
- ALWAYS use "any" searchType for comparisons
- Set limit to null for comparisons to get all matches
- Extract both product identifiers for compareProducts array
- Create variations with/without spaces and dashes for better matching`
        },
        {
          role: 'user',
          content: query
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
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
      console.log('📦 No filters - returning all products')
    }

    if (searchParams.orderBy?.column && columns.includes(searchParams.orderBy.column)) {
      console.log(`📊 Ordering by: ${searchParams.orderBy.column}`)
      dbQuery = dbQuery.order(
        searchParams.orderBy.column,
        { ascending: searchParams.orderBy.ascending ?? true }
      )
    }

    // Apply limit - default to 1000 for comprehensive search
    const limit = searchParams.limit !== undefined && searchParams.limit !== null 
      ? searchParams.limit 
      : 1000
    
    if (limit > 0) {
      dbQuery = dbQuery.limit(limit)
      console.log(`🔢 Applying limit: ${limit}`)
    }

    let { data, error } = await dbQuery

    if (error) {
      console.error('❌ Supabase error:', error)
      throw new Error(`Database error: ${error.message}`)
    }

    console.log(`✅ Query returned ${data?.length || 0} results`)

    // FALLBACK: If comparison query returned no results, try simpler search
    if ((!data || data.length === 0) && searchParams.questionType === "comparison" && searchParams.compareProducts?.length > 0) {
      console.log('🔄 No results found, trying fallback search...')
      
      const fallbackFilters: string[] = []
      searchParams.compareProducts.forEach((product: string) => {
        // Remove spaces and special characters for broader match
        const cleanProduct = product.replace(/[\s-]/g, '')
        fallbackFilters.push(`searchable_text.ilike.%${cleanProduct}%`)
        fallbackFilters.push(`sku.ilike.%${cleanProduct}%`)
        fallbackFilters.push(`product_name.ilike.%${cleanProduct}%`)
        fallbackFilters.push(`name.ilike.%${cleanProduct}%`)
      })
      
      const fallbackQuery = supabase
        .from('products')
        .select('*')
        .or(fallbackFilters.join(','))
        .limit(1000)
      
      const fallbackResult = await fallbackQuery
      
      if (!fallbackResult.error && fallbackResult.data && fallbackResult.data.length > 0) {
        console.log(`✅ Fallback search found ${fallbackResult.data.length} results`)
        data = fallbackResult.data
      }
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        success: true,
        questionType: "list",
        results: [],
        count: 0,
        message: "No products found matching your query"
      })
    }

    const cleanedResults = data.map((product: ProductRecord) => cleanProductData(product))

    // Step 4: Handle comparison questions
    if (searchParams.questionType === "comparison") {
      console.log(`🔄 Comparison mode - found ${cleanedResults.length} products`)
      
      if (cleanedResults.length >= 2) {
        // Group products by similarity to comparison terms
        const compareProducts = searchParams.compareProducts || []
        const groupedProducts: ProductRecord[] = []
        
        compareProducts.forEach((term: string) => {
          const matchedProduct = cleanedResults.find((p: ProductRecord) => 
            (p.sku && p.sku.toLowerCase().includes(term.toLowerCase().replace(/[\s-]/g, ''))) ||
            (p.product_name && p.product_name.toLowerCase().includes(term.toLowerCase().replace(/[\s-]/g, ''))) ||
            (p.name && p.name.toLowerCase().includes(term.toLowerCase().replace(/[\s-]/g, '')))
          )
          if (matchedProduct && !groupedProducts.includes(matchedProduct)) {
            groupedProducts.push(matchedProduct)
          }
        })
        
        // If we found matches for comparison terms, use those; otherwise use first 2 results
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
          message: "Found only one product. Need at least 2 products for comparison."
        })
      }
    }

    // Step 5: Handle AI-powered specific questions
    if (searchParams.questionType === "specific_ai" && cleanedResults.length > 0) {
      const product = cleanedResults[0]
      const attributeQuestion = searchParams.attributeQuestion || query
      
      console.log('🤖 Using AI to extract answer from product data')
      
      try {
        // Truncate product data to avoid token limits
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
- Convert HTML entities (e.g., &deg; to °)
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
        // Fallback: return the product data
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
    
    // Return detailed error for debugging
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
