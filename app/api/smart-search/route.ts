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

    // Step 1: Get your table schema
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

    console.log('Available columns:', columns)

    // Step 2: Use ChatGPT to interpret the query with few-shot examples
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a database query assistant. Convert natural language queries into JSON for filtering a products database.

Available columns: ${columns.join(', ')}

You MUST return JSON in this EXACT structure:
{
  "filters": [],
  "orderBy": null,
  "limit": 20
}

The "filters" key must ALWAYS be an array (even if empty).

Filter object structure:
{
  "column": "column_name",
  "operator": "eq" | "ilike" | "gt" | "lt" | "gte" | "lte",
  "value": "value"
}

OrderBy structure (optional):
{
  "column": "column_name",
  "ascending": true
}`
        },
        {
          role: 'user',
          content: 'Show me all products'
        },
        {
          role: 'assistant',
          content: '{"filters": [], "orderBy": null, "limit": 20}'
        },
        {
          role: 'user',
          content: 'Find products with name containing shirt'
        },
        {
          role: 'assistant',
          content: '{"filters": [{"column": "name", "operator": "ilike", "value": "%shirt%"}], "orderBy": null, "limit": 20}'
        },
        {
          role: 'user',
          content: 'Products under $50'
        },
        {
          role: 'assistant',
          content: '{"filters": [{"column": "price", "operator": "lt", "value": 50}], "orderBy": null, "limit": 20}'
        },
        {
          role: 'user',
          content: query
        }
      ],
      response_format: { type: 'json_object' }
    })

    let searchParams
    try {
      searchParams = JSON.parse(completion.choices[0].message.content || '{"filters": [], "limit": 20}')
    } catch (parseError) {
      console.error('Failed to parse GPT response:', completion.choices[0].message.content)
      searchParams = { filters: [], limit: 20 }
    }

    console.log('Parsed search params:', JSON.stringify(searchParams, null, 2))

    // Ensure filters is an array
    if (!searchParams.filters || !Array.isArray(searchParams.filters)) {
      console.log('Filters not an array, resetting to empty array')
      searchParams.filters = []
    }

    // Step 3: Build and execute Supabase query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let supabaseQuery: any = supabase.from('products').select('*')

    // Apply filters
    if (searchParams.filters.length > 0) {
      console.log('Applying filters:', searchParams.filters)
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      searchParams.filters.forEach((filter: any) => {
        const { column, operator, value } = filter
        
        // Validate column exists
        if (!columns.includes(column)) {
          console.warn(`Column "${column}" not found. Available columns:`, columns)
          return
        }
        
        console.log(`Applying filter: ${column} ${operator} ${value}`)
        
        switch (operator) {
          case 'eq':
            supabaseQuery = supabaseQuery.eq(column, value)
            break
          case 'neq':
            supabaseQuery = supabaseQuery.neq(column, value)
            break
          case 'ilike':
            supabaseQuery = supabaseQuery.ilike(column, value)
            break
          case 'gt':
            supabaseQuery = supabaseQuery.gt(column, value)
            break
          case 'lt':
            supabaseQuery = supabaseQuery.lt(column, value)
            break
          case 'gte':
            supabaseQuery = supabaseQuery.gte(column, value)
            break
          case 'lte':
            supabaseQuery = supabaseQuery.lte(column, value)
            break
        }
      })
    } else {
      console.log('No filters applied - returning all products')
    }

    // Apply ordering
    if (searchParams.orderBy && searchParams.orderBy.column && columns.includes(searchParams.orderBy.column)) {
      console.log(`Ordering by: ${searchParams.orderBy.column}`)
      supabaseQuery = supabaseQuery.order(
        searchParams.orderBy.column,
        { ascending: searchParams.orderBy.ascending ?? true }
      )
    }

    // Apply limit
    const limit = searchParams.limit || 20
    supabaseQuery = supabaseQuery.limit(limit)

    // Execute query
    const { data, error } = await supabaseQuery

    if (error) {
      console.error('Supabase error:', error)
      throw new Error(`Database error: ${error.message}`)
    }

    console.log(`Query returned ${data?.length || 0} results`)

    return NextResponse.json({
      success: true,
      results: data,
      count: data?.length || 0,
      searchParams: searchParams
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
