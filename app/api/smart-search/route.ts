import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

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

    // Step 2: Use ChatGPT with better context
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
1. For product codes/SKUs (like "PS 870", "SKU 123", etc.), search in BOTH the SKU column AND any name/title/description columns using partial matches
2. For text searches, use "ilike" with wildcards: "%search%"
3. For numeric comparisons, use: gt, lt, gte, lte
4. When user mentions a product code, create MULTIPLE filters with "or" logic by returning separate filter objects
5. Always look for the most relevant columns based on the query

RESPONSE FORMAT (JSON):
{
  "filters": [
    {
      "column": "column_name",
      "operator": "ilike" | "eq" | "gt" | "lt" | "gte" | "lte",
      "value": "value"
    }
  ],
  "searchType": "all" | "any",
  "orderBy": {
    "column": "column_name",
    "ascending": true
  },
  "limit": 20
}

- "searchType": "all" means AND logic (all filters must match)
- "searchType": "any" means OR logic (any filter can match) - USE THIS for product code searches
- Always return "filters" as an array (empty array [] for "show all")

EXAMPLES:

Query: "Show me all products"
Response: {"filters": [], "searchType": "all", "limit": 20}

Query: "Show me PS 870 products"
Response: {
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%PS 870%"},
    {"column": "sku", "operator": "ilike", "value": "%PS870%"},
    {"column": "sku", "operator": "ilike", "value": "%870%"}
  ],
  "searchType": "any",
  "limit": 20
}

Query: "Products under $50"
Response: {
  "filters": [{"column": "price", "operator": "lt", "value": 50}],
  "searchType": "all",
  "limit": 20
}

Query: "Find red shirts"
Response: {
  "filters": [
    {"column": "name", "operator": "ilike", "value": "%red%"},
    {"column": "name", "operator": "ilike", "value": "%shirt%"}
  ],
  "searchType": "all",
  "limit": 20
}`
        },
        {
          role: 'user',
          content: query
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    })

    let searchParams
    try {
      searchParams = JSON.parse(completion.choices[0].message.content || '{"filters": [], "searchType": "all", "limit": 20}')
    } catch (parseError) {
      console.error('Failed to parse GPT response:', completion.choices[0].message.content)
      searchParams = { filters: [], searchType: "all", limit: 20 }
    }

    console.log('Parsed search params:', JSON.stringify(searchParams, null, 2))

    // Ensure proper structure
    if (!searchParams.filters || !Array.isArray(searchParams.filters)) {
      searchParams.filters = []
    }
    if (!searchParams.searchType) {
      searchParams.searchType = "all"
    }

    // Step 3: Build Supabase query - START WITH BASE QUERY
    let dbQuery = supabase.from('products').select('*')

    // Apply filters based on search type
    if (searchParams.filters.length > 0) {
      console.log(`Applying ${searchParams.filters.length} filters with ${searchParams.searchType} logic`)
      
      if (searchParams.searchType === "any") {
        // OR logic - use Supabase's .or() method
        const orConditions = searchParams.filters.map((filter: any) => {
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
        }).filter(Boolean)
        
        if (orConditions.length > 0) {
          dbQuery = dbQuery.or(orConditions.join(','))
          console.log('OR conditions:', orConditions.join(','))
        }
      } else {
        // AND logic - apply filters one by one WITHOUT reassignment in loop
        const validFilters = searchParams.filters.filter((filter: any) => 
          columns.includes(filter.column)
        )
        
        for (const filter of validFilters) {
          const { column, operator, value } = filter
          console.log(`Applying filter: ${column} ${operator} ${value}`)
          
          // Apply each filter by chaining
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
      console.log('No filters - returning all products')
    }

    // Apply ordering
    if (searchParams.orderBy?.column && columns.includes(searchParams.orderBy.column)) {
      dbQuery = dbQuery.order(
        searchParams.orderBy.column,
        { ascending: searchParams.orderBy.ascending ?? true }
      )
    }

    // Apply limit
    const limit = searchParams.limit || 50
    dbQuery = dbQuery.limit(limit)

    // Execute query
    const { data, error } = await dbQuery

    if (error) {
      console.error('Supabase error:', error)
      throw new Error(`Database error: ${error.message}`)
    }

    console.log(`Query returned ${data?.length || 0} results`)

    return NextResponse.json({
      success: true,
      results: data,
      count: data?.length || 0
    })

  } catch (error: any) {
    console.error('Smart search error:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Internal server error',
        details: error.toString()
      },
      { status: 500 }
    )
  }
}
