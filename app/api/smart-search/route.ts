import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Helper function to strip HTML tags
function stripHtml(html: string): string {
  if (typeof html !== 'string') return html
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

// Helper function to clean and flatten product data
function cleanProductData(product: any): any {
  const cleaned: any = {}
  
  // Fields to exclude
  const excludeFields = ['embedding', 'all_attributes']
  
  // Process regular fields
  Object.keys(product).forEach(key => {
    if (excludeFields.includes(key)) return
    
    const value = product[key]
    
    // Skip null, undefined, or empty string values
    if (value === null || value === undefined || value === '') return
    
    // Strip HTML if it's a string
    if (typeof value === 'string') {
      const cleanedValue = stripHtml(value)
      if (cleanedValue) {
        cleaned[key] = cleanedValue
      }
    } else {
      cleaned[key] = value
    }
  })
  
  // Parse and merge all_attributes if it exists
  if (product.all_attributes) {
    try {
      let attributes: any = {}
      
      // Handle if all_attributes is a string (JSON string)
      if (typeof product.all_attributes === 'string') {
        attributes = JSON.parse(product.all_attributes)
      } else if (typeof product.all_attributes === 'object') {
        attributes = product.all_attributes
      }
      
      // Add individual attributes to cleaned object
      Object.keys(attributes).forEach(key => {
        const value = attributes[key]
        
        // Skip empty values
        if (value === null || value === undefined || value === '') return
        
        // Strip HTML from attribute values
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

    // Create a sample data preview for GPT to understand the data structure
    const samplePreview = sampleData?.slice(0, 2).map(item => {
      const preview: any = {}
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

    console.log('Available columns:', columns)
    console.log('User query:', query)

    // Step 2: Use ChatGPT with improved prompting
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a smart database search assistant. Analyze user queries and generate appropriate database filters.

DATABASE SCHEMA:
Columns: ${columns.join(', ')}

SAMPLE DATA:
${JSON.stringify(samplePreview, null, 2)}

SEARCH RULES:
1. **EXACT SKU MATCH**: When user provides a complete SKU (e.g., "0870A00276012PT"), use EXACT match with "eq" operator
2. **PARTIAL SEARCH**: When user says "show me", "find", "search for" with partial terms, use "ilike" with wildcards
3. **BROAD SEARCH**: When unsure, prefer broader searches with "ilike" and "any" (OR logic)
4. For text searches, use "ilike" with wildcards: "%search%"
5. **DEFAULT TO SHOWING RESULTS**: When in doubt, return results rather than being too restrictive

IMPORTANT INTENT DETECTION:
- "show details of [EXACT_SKU]" → eq operator, limit: 1
- "what is the [field] of [EXACT_SKU]" → eq operator, questionType: "specific"
- "show me [partial]" → ilike operator, searchType: "any", limit: null
- "find [partial]" → ilike operator, searchType: "any", limit: null
- "products with [term]" → ilike operator, searchType: "any", limit: null
- "show all" → no filters, limit: null

RESPONSE FORMAT (JSON):
{
  "filters": [
    {
      "column": "column_name",
      "operator": "eq" | "ilike" | "gt" | "lt" | "gte" | "lte",
      "value": "value"
    }
  ],
  "searchType": "all" | "any",
  "questionType": "list" | "specific",
  "extractFields": ["field1", "field2"],
  "answerTemplate": "The color is {color}",
  "orderBy": {
    "column": "column_name",
    "ascending": true
  },
  "limit": null | 1
}

CRITICAL RULES:
- Use "searchType": "any" (OR logic) for most searches to show more results
- Use "searchType": "all" (AND logic) only for very specific exact matches
- Default "limit": null (show all matching results)
- Only use "limit": 1 for "show details of [exact SKU]" or specific questions
- When searching partial terms, search across multiple columns (sku, name, description)

EXAMPLES:

Query: "Show me all products"
Response: {
  "filters": [], 
  "searchType": "all", 
  "questionType": "list",
  "limit": null
}

Query: "Show the details of 0870A00276012PT"
Response: {
  "filters": [
    {"column": "sku", "operator": "eq", "value": "0870A00276012PT"}
  ],
  "searchType": "all",
  "questionType": "list",
  "limit": 1
}

Query: "Show me PS 870"
Response: {
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%PS 870%"},
    {"column": "sku", "operator": "ilike", "value": "%PS870%"},
    {"column": "name", "operator": "ilike", "value": "%PS 870%"},
    {"column": "name", "operator": "ilike", "value": "%PS870%"}
  ],
  "searchType": "any",
  "questionType": "list",
  "limit": null
}

Query: "Find 870"
Response: {
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%870%"},
    {"column": "name", "operator": "ilike", "value": "%870%"}
  ],
  "searchType": "any",
  "questionType": "list",
  "limit": null
}

Query: "What is the color of 0890A1/2AM012PTSAL"
Response: {
  "filters": [
    {"column": "sku", "operator": "eq", "value": "0890A1/2AM012PTSAL"}
  ],
  "searchType": "all",
  "questionType": "specific",
  "extractFields": ["sku", "color", "colour", "name"],
  "answerTemplate": "The color of {sku} is {color}",
  "limit": 1
}

Query: "Products containing blue"
Response: {
  "filters": [
    {"column": "name", "operator": "ilike", "value": "%blue%"},
    {"column": "description", "operator": "ilike", "value": "%blue%"},
    {"column": "color", "operator": "ilike", "value": "%blue%"},
    {"column": "colour", "operator": "ilike", "value": "%blue%"}
  ],
  "searchType": "any",
  "questionType": "list",
  "limit": null
}`
        },
        {
          role: 'user',
          content: query
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    })

    let searchParams
    try {
      searchParams = JSON.parse(completion.choices[0].message.content || '{"filters": [], "searchType": "all", "questionType": "list", "limit": null}')
    } catch (parseError) {
      console.error('Failed to parse GPT response:', completion.choices[0].message.content)
      searchParams = { filters: [], searchType: "all", questionType: "list", limit: null }
    }

    console.log('📋 Parsed search params:', JSON.stringify(searchParams, null, 2))

    // Ensure proper structure with safe defaults
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

    // Apply filters based on search type
    if (searchParams.filters.length > 0) {
      console.log(`🔍 Applying ${searchParams.filters.length} filters with ${searchParams.searchType} logic`)
      
      if (searchParams.searchType === "any") {
        const orConditionString = buildOrConditions(searchParams.filters, columns)
        
        if (orConditionString) {
          dbQuery = dbQuery.or(orConditionString)
          console.log('✅ OR conditions:', orConditionString)
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

    // Apply ordering
    if (searchParams.orderBy?.column && columns.includes(searchParams.orderBy.column)) {
      console.log(`📊 Ordering by: ${searchParams.orderBy.column}`)
      dbQuery = dbQuery.order(
        searchParams.orderBy.column,
        { ascending: searchParams.orderBy.ascending ?? true }
      )
    }

    // Apply limit
    const limit = searchParams.limit !== undefined && searchParams.limit !== null 
      ? searchParams.limit 
      : 1000
    
    if (limit > 0) {
      dbQuery = dbQuery.limit(limit)
      console.log(`🔢 Applying limit: ${limit}`)
    }

    // Execute query
    const { data, error } = await dbQuery

    if (error) {
      console.error('❌ Supabase error:', error)
      throw new Error(`Database error: ${error.message}`)
    }

    console.log(`✅ Query returned ${data?.length || 0} results`)

    // Clean and flatten the results
    const cleanedResults = data?.map(product => cleanProductData(product)) || []

    // Step 4: Handle specific questions
    if (searchParams.questionType === "specific" && cleanedResults.length > 0) {
      const product = cleanedResults[0]
      const extractFields = searchParams.extractFields || []
      const answerTemplate = searchParams.answerTemplate || ""
      
      const extractedData: any = {}
      extractFields.forEach((field: string) => {
        if (product[field] !== undefined && product[field] !== null) {
          extractedData[field] = product[field]
        }
      })
      
      let answer = answerTemplate
      Object.keys(extractedData).forEach(key => {
        const placeholder = `{${key}}`
        answer = answer.replace(new RegExp(placeholder, 'g'), extractedData[key])
      })
      
      answer = answer.replace(/\{[^}]+\}/g, 'N/A')
      
      return NextResponse.json({
        success: true,
        questionType: "specific",
        answer: answer,
        extractedData: extractedData,
        fullProduct: product
      })
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
        error: error.message || 'Internal server error',
        details: error.toString()
      },
      { status: 500 }
    )
  }
}
