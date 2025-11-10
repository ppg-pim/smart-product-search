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

    console.log('Available columns:', columns)
    console.log('User query:', query)

    // Step 2: Use ChatGPT to understand the query
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

IMPORTANT NOTES:
- The "searchable_text" column contains ALL product information (flattened from all_attributes)
- When searching for product attributes, ALWAYS include "searchable_text" in filters
- For specific questions about attributes (color, cure time, etc.), search in "searchable_text"

SEARCH RULES:
1. **EXACT SKU MATCH**: When user provides a complete SKU, use EXACT match with "eq" on "sku" column
2. **ATTRIBUTE QUESTIONS**: When asking about product attributes (color, cure time, class, etc.):
   - Use "ilike" on "searchable_text" column with the product identifier
   - Set questionType to "specific_ai" to trigger AI extraction
3. **PARTIAL SEARCH**: Use "ilike" with wildcards on multiple columns including "searchable_text"
4. **COMPARISON**: When comparing products, use "comparison" questionType
5. **DEFAULT TO BROAD SEARCH**: When unsure, search "searchable_text" column

INTENT DETECTION:
- "what is the [attribute] of [product]" → questionType: "specific_ai", search in searchable_text
- "show details of [SKU]" → questionType: "list", exact SKU match
- "compare [SKU1] and [SKU2]" → questionType: "comparison"
- "show me [partial]" → questionType: "list", broad search

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
  "attributeQuestion": "the original attribute question",
  "compareProducts": ["SKU1", "SKU2"],
  "limit": null | 1
}

EXAMPLES:

Query: "What is the color of PR-1440M Class B"
Response: {
  "filters": [
    {"column": "searchable_text", "operator": "ilike", "value": "%PR-1440M%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%Class B%"}
  ],
  "searchType": "all",
  "questionType": "specific_ai",
  "attributeQuestion": "What is the color?",
  "limit": 1
}

Query: "what is the cure time of 0821XXXXXX651SKCS"
Response: {
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%0821%651SKCS%"}
  ],
  "searchType": "any",
  "questionType": "specific_ai",
  "attributeQuestion": "What is the cure time?",
  "limit": 1
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

    if (searchParams.orderBy?.column && columns.includes(searchParams.orderBy.column)) {
      console.log(`📊 Ordering by: ${searchParams.orderBy.column}`)
      dbQuery = dbQuery.order(
        searchParams.orderBy.column,
        { ascending: searchParams.orderBy.ascending ?? true }
      )
    }

    const limit = searchParams.limit !== undefined && searchParams.limit !== null 
      ? searchParams.limit 
      : 1000
    
    if (limit > 0) {
      dbQuery = dbQuery.limit(limit)
      console.log(`🔢 Applying limit: ${limit}`)
    }

    const { data, error } = await dbQuery

    if (error) {
      console.error('❌ Supabase error:', error)
      throw new Error(`Database error: ${error.message}`)
    }

    console.log(`✅ Query returned ${data?.length || 0} results`)

    const cleanedResults = data?.map((product: ProductRecord) => cleanProductData(product)) || []

    // Step 4: Handle comparison questions
    if (searchParams.questionType === "comparison" && cleanedResults.length >= 2) {
      return NextResponse.json({
        success: true,
        questionType: "comparison",
        products: cleanedResults,
        compareProducts: searchParams.compareProducts || []
      })
    }

    // Step 5: Handle AI-powered specific questions
    if (searchParams.questionType === "specific_ai" && cleanedResults.length > 0) {
      const product = cleanedResults[0]
      const attributeQuestion = searchParams.attributeQuestion || query
      
      console.log('🤖 Using AI to extract answer from product data')
      
      // Use AI to extract the specific answer from the product data
      const answerCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a product information assistant. Given a product's data and a question, extract the relevant answer.

RULES:
- Answer the question directly and concisely
- If the information is not found, say "Information not available"
- Extract ALL relevant information related to the question
- Format lists as bullet points with "•" (not HTML)
- Remove all HTML tags
- Convert HTML entities (e.g., &deg; to °)
- Be specific and complete

PRODUCT DATA:
${JSON.stringify(product, null, 2)}`
          },
          {
            role: 'user',
            content: attributeQuestion
          }
        ],
        temperature: 0.1
      })
      
      let answer = answerCompletion.choices[0].message.content || 'Information not available'
      
      // Clean up the answer
      answer = stripHtml(answer)
      
      return NextResponse.json({
        success: true,
        questionType: "specific",
        answer: answer,
        extractedData: {
          sku: product.sku || product.product_name || 'N/A',
          question: attributeQuestion
        },
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
