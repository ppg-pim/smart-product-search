import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

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

    // Step 2: Use ChatGPT with better context
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a smart database search assistant. Analyze user queries and generate appropriate database filters and specify what information to extract.

DATABASE SCHEMA:
Columns: ${columns.join(', ')}

SAMPLE DATA:
${JSON.stringify(samplePreview, null, 2)}

SEARCH RULES:
1. For product codes/SKUs (like "PS 870", "SKU 123", "0890A1/2AM012PTSAL"), search in BOTH the SKU column AND any name/title/description columns using partial matches
2. For text searches, use "ilike" with wildcards: "%search%"
3. For numeric comparisons, use: gt, lt, gte, lte
4. When user mentions a product code, create MULTIPLE filters with "or" logic by returning separate filter objects
5. Always look for the most relevant columns based on the query
6. **IMPORTANT**: If user asks a SPECIFIC QUESTION about a product (like "what is the color", "what is the price", "what is the description"), set "questionType" to "specific" and specify which fields to extract
7. **DO NOT SET LIMIT** - Return all matching results (set limit to null or 10000)

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
  "questionType": "list" | "specific",
  "extractFields": ["field1", "field2"],
  "answerTemplate": "The color is {color}",
  "orderBy": {
    "column": "column_name",
    "ascending": true
  },
  "limit": null
}

- "questionType": "list" = show full product cards (default)
- "questionType": "specific" = answer a specific question with extracted data
- "extractFields": array of column names to extract for specific questions
- "answerTemplate": how to format the answer (use {fieldname} placeholders)
- "limit": null or 10000 for all results, 1 for specific questions

EXAMPLES:

Query: "Show me all products"
Response: {
  "filters": [], 
  "searchType": "all", 
  "questionType": "list",
  "limit": null
}

Query: "Show me PS 870 products"
Response: {
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%PS 870%"},
    {"column": "sku", "operator": "ilike", "value": "%PS870%"},
    {"column": "sku", "operator": "ilike", "value": "%870%"}
  ],
  "searchType": "any",
  "questionType": "list",
  "limit": null
}

Query: "What is the color of 0890A1/2AM012PTSAL"
Response: {
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%0890A1/2AM012PTSAL%"},
    {"column": "sku", "operator": "ilike", "value": "%0890A1%"}
  ],
  "searchType": "any",
  "questionType": "specific",
  "extractFields": ["sku", "color", "colour", "name"],
  "answerTemplate": "The color of {sku} is {color}",
  "limit": 1
}

Query: "What is the price of PS 870"
Response: {
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%PS 870%"},
    {"column": "sku", "operator": "ilike", "value": "%PS870%"}
  ],
  "searchType": "any",
  "questionType": "specific",
  "extractFields": ["sku", "price", "name"],
  "answerTemplate": "The price of {sku} is {price}",
  "limit": 1
}

Query: "Tell me about product ABC123"
Response: {
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%ABC123%"}
  ],
  "searchType": "any",
  "questionType": "specific",
  "extractFields": ["sku", "name", "description"],
  "answerTemplate": "{sku} - {name}: {description}",
  "limit": 1
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
      searchParams = JSON.parse(completion.choices[0].message.content || '{"filters": [], "searchType": "all", "questionType": "list", "limit": null}')
    } catch (parseError) {
      console.error('Failed to parse GPT response:', completion.choices[0].message.content)
      searchParams = { filters: [], searchType: "all", questionType: "list", limit: null }
    }

    console.log('Parsed search params:', JSON.stringify(searchParams, null, 2))

    // Ensure proper structure
    if (!searchParams.filters || !Array.isArray(searchParams.filters)) {
      searchParams.filters = []
    }
    if (!searchParams.searchType) {
      searchParams.searchType = "all"
    }
    if (!searchParams.questionType) {
      searchParams.questionType = "list"
    }

    // Step 3: Build Supabase query with type assertion to avoid deep instantiation
    let dbQuery: any = supabase.from('products').select('*')

    // Apply filters based on search type
    if (searchParams.filters.length > 0) {
      console.log(`Applying ${searchParams.filters.length} filters with ${searchParams.searchType} logic`)
      
      if (searchParams.searchType === "any") {
        // OR logic - use Supabase's .or() method
        const orConditionString = buildOrConditions(searchParams.filters, columns)
        
        if (orConditionString) {
          dbQuery = dbQuery.or(orConditionString)
          console.log('OR conditions:', orConditionString)
        }
      } else {
        // AND logic - apply filters sequentially
        const validFilters = searchParams.filters.filter((filter: any) => 
          columns.includes(filter.column)
        )
        
        for (const filter of validFilters) {
          const { column, operator, value } = filter
          console.log(`Applying filter: ${column} ${operator} ${value}`)
          
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
      console.log(`Ordering by: ${searchParams.orderBy.column}`)
      dbQuery = dbQuery.order(
        searchParams.orderBy.column,
        { ascending: searchParams.orderBy.ascending ?? true }
      )
    }

    // Apply limit - default to 10000 (effectively all) for list queries, or use specified limit
    const limit = searchParams.limit || (searchParams.questionType === "specific" ? 1 : 10000)
    dbQuery = dbQuery.limit(limit)
    console.log(`Applying limit: ${limit}`)

    // Execute query
    const { data, error } = await dbQuery

    if (error) {
      console.error('Supabase error:', error)
      throw new Error(`Database error: ${error.message}`)
    }

    console.log(`Query returned ${data?.length || 0} results`)

    // Step 4: Handle specific questions
    if (searchParams.questionType === "specific" && data && data.length > 0) {
      const product = data[0]
      const extractFields = searchParams.extractFields || []
      const answerTemplate = searchParams.answerTemplate || ""
      
      // Extract requested fields
      const extractedData: any = {}
      extractFields.forEach((field: string) => {
        if (product[field] !== undefined && product[field] !== null) {
          extractedData[field] = product[field]
        }
      })
      
      // Generate answer using template
      let answer = answerTemplate
      Object.keys(extractedData).forEach(key => {
        const placeholder = `{${key}}`
        answer = answer.replace(new RegExp(placeholder, 'g'), extractedData[key])
      })
      
      // Remove any unfilled placeholders
      answer = answer.replace(/\{[^}]+\}/g, 'N/A')
      
      return NextResponse.json({
        success: true,
        questionType: "specific",
        answer: answer,
        extractedData: extractedData,
        fullProduct: product
      })
    }

    // Default: return full results
    return NextResponse.json({
      success: true,
      questionType: "list",
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
