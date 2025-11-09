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

    // Get schema
    const { data: sampleData } = await supabase
      .from('products')
      .select('*')
      .limit(1)

    const columns = sampleData?.[0] ? Object.keys(sampleData[0]) : []

    // Use ChatGPT to interpret
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Convert natural language to database filter. Return JSON:
{
  "column": "column_name or null",
  "operator": "eq|ilike|gt|lt|gte|lte or null",
  "value": "search_value or null",
  "orderBy": "column_name",
  "ascending": true,
  "limit": 20
}
Available columns: ${columns.join(', ')}`
        },
        {
          role: 'user',
          content: query
        }
      ],
      response_format: { type: 'json_object' }
    })

    const params = JSON.parse(completion.choices[0].message.content || '{}')

    // Call RPC function
    const { data, error } = await supabase.rpc('search_products', {
      search_column: params.column,
      search_operator: params.operator,
      search_value: params.value,
      order_column: params.orderBy || 'id',
      order_ascending: params.ascending !== false,
      result_limit: params.limit || 20
    })

    if (error) throw error

    // Extract results from JSONB
    const results = data?.map((row: any) => row.result) || []

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
      searchParams: params
    })

  } catch (error: any) {
    console.error('Smart search error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
