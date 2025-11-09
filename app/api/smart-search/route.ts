import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface Filter {
  column: string
  operator: 'eq' | 'ilike' | 'gt' | 'lt' | 'gte' | 'lte'
  value: string | number
}

interface SearchParams {
  filters?: Filter[]
  orderBy?: {
    column: string
    ascending: boolean
  }
  limit?: number
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

    // Step 1: Get your table schema (first time only, or cache this)
    const { data: sampleData, error: schemaError } = await supabase
      .from('products')
      .select('*')
      .limit(1)

    if (schemaError) {
      throw new Error(`Schema error: ${schemaError.message}`)
    }

    const columns = sampleData && sampleData.length > 0 
      ? Object.keys(sampleData[0]) 
      : []

    // Step 2: Use ChatGPT to interpret the query
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a database query assistant. Given a natural language query, convert it into a JSON object that describes how to filter a products database.

Available columns: ${columns.join(', ')}

Return a JSON object with this structure:
{
  "filters": [
    {
      "column": "column_name",
      "operator": "eq" | "ilike" | "gt" | "lt" | "gte" | "lte",
      "value": "search_value"
    }
  ],
  "orderBy": {
    "column": "column_name",
    "ascending": true | false
  },
  "limit": number
}

For text searches, use "ilike" operator with % wildcards.
If no specific filters are needed, return empty filters array to get all products.`
        },
        {
          role: 'user',
          content: query
        }
      ],
      response_format: { type: 'json_object' }
    })

    const searchParams: SearchParams = JSON.parse(
      completion.choices[0].message.content || '{}'
    )

    // Step 3: Build Supabase query using .or() and string-based filters
    let queryString = '*'
    const limit = searchParams.limit || 20

    // Build the query
    let dbQuery = supabase.from('products').select(queryString)

    // Apply filters using a different approach to avoid type issues
    if (searchParams.filters && searchParams.filters.length > 0) {
      for (const filter of searchParams.filters) {
        const { column, operator, value } = filter
        
        // Use type assertion to bypass the deep type checking
        switch (operator) {
          case 'eq':
            dbQuery = dbQuery.eq(column as any, value)
            break
          case 'ilike':
            dbQuery = dbQuery.ilike(column as any, value as string)
            break
          case 'gt':
            dbQuery = dbQuery.gt(column as any, value)
            break
          case 'lt':
            dbQuery = dbQuery.lt(column as any, value)
            break
          case 'gte':
            dbQuery = dbQuery.gte(column as any, value)
            break
          case 'lte':
            dbQuery = dbQuery.lte(column as any, value)
            break
        }
      }
    }

    // Apply ordering
    if (searchParams.orderBy) {
      dbQuery = dbQuery.order(
        searchParams.orderBy.column as any,
        { ascending: searchParams.orderBy.ascending }
      )
    }

    // Apply limit
    dbQuery = dbQuery.limit(limit)

    // Execute query
    const { data, error } = await dbQuery

    if (error) {
      throw new Error(`Database error: ${error.message}`)
    }

    return NextResponse.json({
      success: true,
      results: data,
      count: data?.length || 0,
      searchParams: searchParams
    })

  } catch (error: any) {
    console.error('Smart search error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
