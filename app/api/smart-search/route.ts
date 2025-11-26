import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type ProductRecord = Record<string, any>

// ============================================================================
// SMART AI SYSTEM PROMPT - WITH PROPER TABLE FORMAT
// ============================================================================

function getSmartAISystemPrompt(): string {
  return `You are an expert aerospace sealants and coatings consultant with deep technical knowledge.

**YOUR ROLE:**
You will receive product data from a sealants database. Your job is to:
1. **Analyze the data structure** - Understand what fields are available
2. **Extract relevant information** - Find the answer to the user's question
3. **Provide clear, accurate answers** - Based ONLY on the data provided

**HOW TO ANSWER:**

- **For specific questions** (e.g., "what is the cure time of PS 870"):
  → Search through ALL fields in the product data
  → Find fields that contain relevant information
  → Extract and present the exact values
  → If multiple related fields exist, show all of them
  
- **For comparison questions (2 products)**:
  → Start with a brief summary (1-2 sentences)
  → Show key differences in a simple list format
  → **ALWAYS use a markdown table for detailed specifications**
  → Show similarities after the table
  → End with recommendations
  
- **For "best for" questions**:
  → Analyze application fields
  → Look for specification matches
  → Rank products by relevance
  → Explain WHY each product is suitable
  
- **For general questions**:
  → Provide an overview of key product characteristics
  → Focus on the most important/relevant fields
  → Explain technical specifications in context

**IMPORTANT RULES:**
1. **Don't assume field names** - The database structure may vary
2. **Search intelligently** - Look for keywords in field names
3. **Be thorough** - Check all fields, not just obvious ones
4. **Use natural field names** - Convert underscores to spaces (e.g., "Mix Ratio" not "Mix_Ratio")
5. **If data is missing** - Clearly state "This information is not available"
6. **Be precise** - Use exact values from the data
7. **Context matters** - Consider aerospace requirements

**FORMATTING:**
- Use markdown for readability
- Use **bold** for important specifications and differences
- **ALWAYS use markdown tables for side-by-side comparisons**
- Use dashes (-) for lists, NOT bullet points (•)
- Keep answers concise but complete
- When citing field sources, use natural language without underscores

**COMPARISON FORMAT (2 PRODUCTS) - MANDATORY TABLE FORMAT:**

**Comparison: [Product Family/Type]**

**Quick Summary:**
[Brief 1-2 sentence overview of main differences]

---

**Key Difference:**

🔹 **[Main Difference Category]**
- **Product A**: [value]
- **Product B**: [value]

---

**Detailed Specifications:**

| Specification | [Product A SKU] | [Product B SKU] |
|--------------|-----------------|-----------------|
| **Color** | [value] | [value] |
| **Specification** | [value] | [value] |
| **Pot Life** | [value] | [value] |
| **Dry Hard** | [value] | [value] |
| **Full Cure** | [value] | [value] |
| **Temperature Range** | [value] | [value] |
| **Mixing Ratio** | [value] | [value] |

---

**Similarities:**
- [List all common specifications]

**Recommendation:**
- Choose **Product A** if [reason]
- Choose **Product B** if [reason]

**Use Cases:**
- [Describe typical applications for both products]

---

**CRITICAL: When comparing 2 products, you MUST use a markdown table for the "Detailed Specifications" section. Do NOT use separate lists for each product.**

Remember: Your goal is to make comparisons **easy to scan and understand**. ALWAYS use markdown tables for side-by-side product comparisons.`
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateSearchVariations(productCode: string): string[] {
  const variations = new Set<string>()
  variations.add(productCode)
  
  const cleaned = productCode.replace(/[\s\-\/®™©]/g, '')
  if (cleaned.length >= 2) variations.add(cleaned)
  
  const numberMatch = productCode.match(/(\d+)/)
  if (numberMatch && numberMatch[1].length >= 2) {
    variations.add(numberMatch[1])
  }
  
  const patterns = [
    productCode.replace(/\//g, ''),
    productCode.replace(/[\s\-]/g, ''),
  ]
  
  patterns.forEach(p => {
    if (p.length >= 2) variations.add(p)
  })
  
  return Array.from(variations).filter(v => v.length >= 2).slice(0, 5)
}

function extractComparisonItems(query: string): string[] | null {
  let cleaned = query.toLowerCase().trim()
  
  const removeKeywords = [
    'show me the difference of',
    'show me the difference between',
    'show the difference of',
    'show the difference between',
    'show the difference',
    'what is the difference of',
    'what is the difference between',
    'what\'s the difference of',
    'what\'s the difference between',
    'tell me the difference of',
    'tell me the difference between',
    'compare',
    'comparison',
    'show me',
    'tell me',
    'what is the',
    'what\'s the'
  ]
  
  removeKeywords.sort((a, b) => b.length - a.length)
  
  removeKeywords.forEach(keyword => {
    cleaned = cleaned.replace(new RegExp(`\\b${keyword}\\b`, 'gi'), '')
  })
  
  const separators = [
    /\s+vs\.?\s+/gi,
    /\s+versus\s+/gi,
    /\s+to\s+/gi,
    /\s+and\s+/gi,
    /\s+with\s+/gi,
    /\s*,\s*/g
  ]
  
  separators.forEach(sep => {
    cleaned = cleaned.replace(sep, '|||')
  })
  
  const items = cleaned
    .split('|||')
    .map(item => item.trim())
    .filter(item => {
      const noiseWords = ['the', 'a', 'an', 'with', 'between', 'of', 'at', '']
      return item.length > 1 && !noiseWords.includes(item)
    })
  
  if (items.length >= 2) {
    console.log(`  📦 Extracted ${items.length} items: ${items.join(', ')}`)
    return items
  }
  
  return null
}

function detectMetaQuestion(query: string): { isMeta: boolean; type: string | null } {
  const lowerQuery = query.toLowerCase().trim()
  const hasSpecificProduct = /\b(ps|p\/s|pr|korotherm|class|[a-z]{2,}\s*\d{3,}|\d{3,})\b/i.test(query)
  
  if (
    (lowerQuery.match(/^how many (products?|items?|sealants?|entries?)(\s+(are|do|in))?$/) ||
    lowerQuery.match(/^total (number of )?(products?|items?|sealants?)$/) ||
    lowerQuery.match(/^count (of )?(products?|items?|sealants?)$/)) &&
    !hasSpecificProduct
  ) {
    return { isMeta: true, type: 'count' }
  }
  
  if (
    lowerQuery.match(/what (are the |kinds of |types of )?(families|family|types?|categories)/) ||
    lowerQuery.match(/list (all )?(families|family|types?|categories|products?)/) ||
    lowerQuery.match(/show (me )?(all )?(families|family|types?|categories)/)
  ) {
    return { isMeta: true, type: 'list' }
  }
  
  if (
    lowerQuery.match(/what('s| is) in (the |this )?database/) ||
    lowerQuery.match(/tell me about (the |this )?database/) ||
    lowerQuery.match(/database (info|information|overview|summary)/)
  ) {
    return { isMeta: true, type: 'overview' }
  }
  
  return { isMeta: false, type: null }
}

function isCountQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim()
  return (
    lowerQuery.startsWith('how many') ||
    lowerQuery.startsWith('count') ||
    lowerQuery.includes('total number') ||
    lowerQuery.match(/\bhow many\b/) !== null
  )
}

function isComparisonQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase()
  const comparisonKeywords = [
    'compare',
    'comparison',
    'vs',
    'versus',
    'difference between',
    'different between',
    'difference of',
    'difference',
    'differentiation',
    'vs.',
    'compare to',
    'compared to',
    'how does',
    'what\'s the difference'
  ]
  return comparisonKeywords.some(keyword => lowerQuery.includes(keyword))
}

function isAnalyticalQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase()
  const analyticalKeywords = [
    'best', 'recommend', 'should i use', 'which one', 'what is good for',
    'suitable for', 'ideal for', 'appropriate for', 'why use', 'when to use',
    'advantages', 'benefits', 'pros and cons'
  ]
  return analyticalKeywords.some(keyword => lowerQuery.includes(keyword))
}

function extractProductCodes(query: string): string[] {
  const codes: string[] = []
  const patterns = [
    /\b(PS|P\/S|PR|P\/R)\s*[-\s]?\d{3,5}\b/gi,
    /\b[A-Z]{2,}\s*\d{3,5}\b/gi,
    /\b\d{4,}\b/g
  ]
  
  patterns.forEach(pattern => {
    const matches = query.match(pattern)
    if (matches) codes.push(...matches)
  })
  
  return [...new Set(codes)]
}

// ============================================================================
// IMPROVED DATA CLEANING
// ============================================================================

function cleanProductData(product: ProductRecord): ProductRecord {
  const cleaned: ProductRecord = {}
  const seen = new Set<string>()
  
  // Exclude these fields from the final output
  const excludeFields = ['embedding', 'all_attributes']
  
  // Step 1: Process direct fields first
  Object.keys(product).forEach(key => {
    const lowerKey = key.toLowerCase()
    
    // Skip if already seen, excluded, or empty
    if (seen.has(lowerKey) || excludeFields.includes(key)) return
    seen.add(lowerKey)
    
    const value = product[key]
    
    // Skip null, undefined, or empty values
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
  
  // Step 2: Merge all_attributes into the main object (avoid duplicates)
  if (product.all_attributes) {
    try {
      let attributes: ProductRecord = {}
      
      // Parse if string, otherwise use directly
      if (typeof product.all_attributes === 'string') {
        attributes = JSON.parse(product.all_attributes)
      } else if (typeof product.all_attributes === 'object') {
        attributes = product.all_attributes
      }
      
      // Merge attributes that don't already exist
      Object.keys(attributes).forEach(key => {
        const lowerKey = key.toLowerCase()
        
        // Skip if already seen (avoid duplicates)
        if (seen.has(lowerKey)) return
        seen.add(lowerKey)
        
        const value = attributes[key]
        
        // Skip null, undefined, or empty values
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

// Strip HTML and decode entities
function stripHtml(html: string): string {
  if (typeof html !== 'string') return html
  
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&reg;/gi, '®')
    .replace(/&trade;/gi, '™')
    .replace(/&copy;/gi, '©')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&deg;/gi, '°')
    .replace(/&plusmn;/gi, '±')
    .replace(/&times;/gi, '×')
    .replace(/&divide;/gi, '÷')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
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
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function truncateProductData(products: ProductRecord[], maxTokens: number = 20000): ProductRecord[] {
  const truncated: ProductRecord[] = []
  let currentTokens = 0
  
  for (const product of products) {
    const productStr = JSON.stringify(product)
    const productTokens = estimateTokens(productStr)
    
    if (currentTokens + productTokens > maxTokens) {
      console.log(`⚠️ Truncating products at ${truncated.length} to stay within token limit`)
      break
    }
    
    truncated.push(product)
    currentTokens += productTokens
  }
  
  return truncated
}

function rankSearchResults(products: ProductRecord[], keywords: string[]): ProductRecord[] {
  const scored = products.map(product => {
    let score = 0
    const searchText = Object.values(product)
      .filter(v => typeof v === 'string')
      .join(' ')
      .toLowerCase()
    
    keywords.forEach(keyword => {
      const lowerKeyword = keyword.toLowerCase()
      
      if (product.sku?.toLowerCase() === lowerKeyword) {
        score += 100
      } else if (product.sku?.toLowerCase().includes(lowerKeyword)) {
        score += 50
      }
      
      if (product.family?.toLowerCase() === lowerKeyword) {
        score += 80
      } else if (product.family?.toLowerCase().includes(lowerKeyword)) {
        score += 40
      }
      
      if (product.Product_Name?.toLowerCase().includes(lowerKeyword)) {
        score += 30
      }
      
      if (product.Product_Type?.toLowerCase().includes(lowerKeyword)) {
        score += 20
      }
      
      if (product.Product_Model?.toLowerCase().includes(lowerKeyword)) {
        score += 25
      }
      
      if (searchText.includes(lowerKeyword)) {
        score += 10
      }
    })
    
    return { product, score }
  })
  
  scored.sort((a, b) => b.score - a.score)
  return scored.map(s => s.product)
}

// ============================================================================
// DATABASE FUNCTIONS
// ============================================================================

async function getFilterOptionsFromDB() {
  try {
    console.log('🎛️ Fetching sealants filter options from products table...')

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

      const typeValue = product.product_type || product.productType || product.type || product.Type || product.Product_Type
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

          const attrType = attributes.product_type || attributes.productType || attributes.type || attributes.Type || attributes.Product_Type
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

    console.log('✅ Filter options loaded:')
    console.log(`   - Families: ${familiesArray.length}`)
    console.log(`   - Product Types: ${productTypesArray.length}`)
    console.log(`   - Specifications: ${specificationsArray.length}`)

    return {
      filterOptions: {
        families: familiesArray,
        productTypes: productTypesArray,
        specifications: specificationsArray
      }
    }
  } catch (error: any) {
    console.error('❌ Error fetching filter options:', error)
    return {
      filterOptions: {
        families: [],
        productTypes: [],
        specifications: []
      }
    }
  }
}

async function searchProducts(query: string, filters: any): Promise<ProductRecord[]> {
  try {
    console.log('🔍 Searching products with query:', query)
    console.log('🎛️ Applied filters:', filters)
    
    const productCodes = extractProductCodes(query)
    console.log('  🏷️ Extracted product codes:', productCodes)
    
    // ✅ NEW: If we have product codes, search for each one separately
    if (productCodes.length > 0) {
      const allProducts: ProductRecord[] = []
      const seenSKUs = new Set<string>()
      
      for (const code of productCodes) {
        console.log(`  🔍 Searching for: "${code}"`)
        
        let codeQueryBuilder = supabase.from('products').select('*')
        
        // Apply filters
        if (filters?.family) codeQueryBuilder = codeQueryBuilder.eq('family', filters.family)
        if (filters?.productType) codeQueryBuilder = codeQueryBuilder.eq('product_type', filters.productType)
        if (filters?.specification) codeQueryBuilder = codeQueryBuilder.eq('specification', filters.specification)
        
        const variations = generateSearchVariations(code)
        const familySearchTerm = code.replace(/\s+/g, '').toUpperCase()
        
        const orConditions: string[] = []
        variations.forEach(v => {
          orConditions.push(`sku.ilike.%${v}%`)
          orConditions.push(`product_name.ilike.%${v}%`)
          orConditions.push(`family.ilike.%${v}%`)
        })
        orConditions.push(`family.ilike.%${familySearchTerm}%`)
        
        codeQueryBuilder = codeQueryBuilder.or(orConditions.join(',')).limit(20)
        
        const { data, error } = await codeQueryBuilder
        
        if (error) {
          console.error(`  ❌ Error searching for "${code}":`, error)
          continue
        }
        
        if (data && data.length > 0) {
          console.log(`  ✅ Found ${data.length} products for "${code}"`)
          data.forEach((product: any) => {
            if (!seenSKUs.has(product.sku)) {
              seenSKUs.add(product.sku)
              allProducts.push(product)
            }
          })
        } else {
          console.log(`  ⚠️ No products found for "${code}"`)
        }
      }
      
      console.log(`✅ Total found: ${allProducts.length} unique products`)
      return allProducts.map(cleanProductData)
    }
    
    // Original search logic for non-product-code queries...
    let queryBuilder = supabase.from('products').select('*')
    
    if (filters?.family) queryBuilder = queryBuilder.eq('family', filters.family)
    if (filters?.productType) queryBuilder = queryBuilder.eq('product_type', filters.productType)
    if (filters?.specification) queryBuilder = queryBuilder.eq('specification', filters.specification)
    
    const searchTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 2)
      .join(' | ')
    
    if (searchTerms) {
      console.log('  📝 Full-text search terms:', searchTerms)
      queryBuilder = queryBuilder.textSearch('searchable_text', searchTerms)
    }

    const { data, error } = await queryBuilder.limit(50)

    if (error) {
      console.error('❌ Search error:', error)
      return []
    }

    console.log(`✅ Found ${data?.length || 0} products`)
    return (data || []).map(cleanProductData)
    
  } catch (error: any) {
    console.error('❌ Search products error:', error)
    return []
  }
}

async function tryFuzzySearch(keyword: string): Promise<ProductRecord[]> {
  console.log(`🔍 Trying fuzzy search for: ${keyword}`)
  
  try {
    const searchTerm = keyword
    const compactTerm = keyword.replace(/\s+/g, '').toUpperCase()
    const numericPart = keyword.match(/\d+/)?.[0] || ''
    
    console.log(`  🔍 Fuzzy variants: "${searchTerm}", "${compactTerm}", "${numericPart}"`)
    
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .or(
        `sku.ilike.%${searchTerm}%,` +
        `family.ilike.%${searchTerm}%,` +
        `family.ilike.%${compactTerm}%,` +
        `family.ilike.%${numericPart}%,` +
        `product_name.ilike.%${searchTerm}%,` +
        `Product_Type.ilike.%${searchTerm}%,` +
        `Product_Model.ilike.%${searchTerm}%`
      )
      .limit(20)
    
    if (error) throw error
    
    if (data && data.length > 0) {
      console.log(`✅ Fuzzy search found ${data.length} results`)
      return data
    }
  } catch (error: any) {
    console.error(`❌ Fuzzy search error:`, error)
  }
  
  return []
}

async function handleMetaQuestion(query: string, type: string, filters: any) {
  try {
    console.log(`🎯 Handling meta-question type: ${type}`)
    
    if (type === 'count') {
      const lowerQuery = query.toLowerCase()
      let filter: { filterType: string; filterValue: string } | null = null
      
      if (lowerQuery.includes('family') || lowerQuery.includes('families')) {
        const familyMatch = query.match(/\b([A-Z][A-Za-z\s]+(?:family|Family)?)\b/)
        if (familyMatch) {
          filter = { filterType: 'family', filterValue: familyMatch[1].trim() }
        }
      }
      
      if (lowerQuery.includes('type') || lowerQuery.includes('types')) {
        const typeMatch = query.match(/\b([A-Z][A-Za-z\s]+(?:type|Type)?)\b/)
        if (typeMatch) {
          filter = { filterType: 'type', filterValue: typeMatch[1].trim() }
        }
      }
      
      let queryBuilder = supabase.from('products').select('*', { count: 'exact', head: true })
      
      if (filter) {
        if (filter.filterType === 'family') {
          queryBuilder = queryBuilder.eq('family', filter.filterValue)
        } else if (filter.filterType === 'type') {
          queryBuilder = queryBuilder.eq('product_type', filter.filterValue)
        }
      }
      
      const { count, error } = await queryBuilder
      
      if (error) {
        return NextResponse.json({
          questionType: 'meta',
          metaType: 'count',
          summary: 'Unable to retrieve count at this time.',
          count: 0
        })
      }
      
      let summary = ''
      if (filter) {
        summary = `There are **${count || 0}** sealant products in the **${filter.filterValue}** ${filter.filterType}.`
      } else {
        summary = `The sealants database contains **${count || 0}** total products.`
      }
      
      return NextResponse.json({
        questionType: 'meta',
        metaType: 'count',
        summary,
        count: count || 0,
        filter: filter || undefined
      })
    }
    
    if (type === 'list') {
      const { data: families } = await supabase
        .from('products')
        .select('family')
        .not('family', 'is', null)
        .neq('family', '')
      
      const { data: types } = await supabase
        .from('products')
        .select('product_type')
        .not('product_type', 'is', null)
        .neq('product_type', '')
      
      const uniqueFamilies = [...new Set(families?.map(f => f.family) || [])].sort()
      const uniqueTypes = [...new Set(types?.map(t => t.product_type) || [])].sort()
      
      let summary = '## Sealants Database Categories\n\n'
      
      if (uniqueFamilies.length > 0) {
        summary += `### Product Families (${uniqueFamilies.length})\n\n`
        uniqueFamilies.forEach(family => {
          summary += `- ${family}\n`
        })
        summary += '\n'
      }
      
      if (uniqueTypes.length > 0) {
        summary += `### Product Types (${uniqueTypes.length})\n\n`
        uniqueTypes.forEach(type => {
          summary += `- ${type}\n`
        })
      }
      
      return NextResponse.json({
        questionType: 'meta',
        metaType: 'list',
        summary,
        families: uniqueFamilies,
        types: uniqueTypes,
        count: uniqueFamilies.length + uniqueTypes.length
      })
    }
    
    if (type === 'overview') {
      const { count: totalCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
      
      const { data: families } = await supabase
        .from('products')
        .select('family')
        .not('family', 'is', null)
        .neq('family', '')
      
      const { data: types } = await supabase
        .from('products')
        .select('product_type')
        .not('product_type', 'is', null)
        .neq('product_type', '')
      
      const uniqueFamilies = [...new Set(families?.map(f => f.family) || [])]
      const uniqueTypes = [...new Set(types?.map(t => t.product_type) || [])]
      
      const summary = `## Sealants Database Overview

**Total Products**: ${totalCount || 0}

**Product Families**: ${uniqueFamilies.length}
**Product Types**: ${uniqueTypes.length}

### Key Features:
- Comprehensive aerospace sealants catalog
- Advanced search with natural language queries
- Product comparison capabilities
- Detailed technical specifications
- Filter by family, type, and specification`
      
      return NextResponse.json({
        questionType: 'meta',
        metaType: 'overview',
        summary,
        count: totalCount || 0,
        stats: {
          totalProducts: totalCount || 0,
          families: uniqueFamilies.length,
          types: uniqueTypes.length
        }
      })
    }
    
    return NextResponse.json({
      questionType: 'meta',
      metaType: type,
      summary: 'Unable to process this database query.',
      count: 0
    })
    
  } catch (error: any) {
    console.error('❌ Meta-question error:', error)
    return NextResponse.json({
      questionType: 'meta',
      metaType: type,
      summary: 'An error occurred while processing your database query.',
      count: 0,
      error: error.message
    })
  }
}

// ============================================================================
// AI GENERATION FUNCTIONS
// ============================================================================

async function generateComparison(products: ProductRecord[], query: string): Promise<string> {
  try {
    const systemPrompt = getSmartAISystemPrompt()
    console.log(`🔄 Generating comparison for ${products.length} products...`)
    
    const truncatedProducts = truncateProductData(products, 15000)
    const productsJson = JSON.stringify(truncatedProducts, null, 2)
    const estimatedTokens = estimateTokens(productsJson)
    
    console.log(`   📊 Using ${truncatedProducts.length} products (~${estimatedTokens} tokens)`)
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Compare these sealant products. **IMPORTANT: Use a markdown table for the "Detailed Specifications" section to show side-by-side comparison.**\n\nProducts:\n${productsJson}\n\nUser question: ${query}`
        }
      ],
      temperature: 0.3,
      max_tokens: 2500
    })

    console.log('✅ Comparison generated successfully')
    return response.choices[0].message.content || 'Comparison not available'
    
  } catch (error: any) {
    console.error('❌ Comparison generation error:', error)
    return 'Unable to generate comparison at this time.'
  }
}

async function generateAnalyticalSummary(products: ProductRecord[], query: string): Promise<string> {
  try {
    const systemPrompt = getSmartAISystemPrompt()
    console.log(`🧠 Generating analytical summary for ${products.length} products...`)
    
    const truncatedProducts = truncateProductData(products.slice(0, 10), 15000)
    const productsJson = JSON.stringify(truncatedProducts, null, 2)
    const estimatedTokens = estimateTokens(productsJson)
    
    console.log(`   📊 Using ${truncatedProducts.length} products (~${estimatedTokens} tokens)`)
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Analyze these sealant products and provide a detailed answer to: ${query}\n\nProducts:\n${productsJson}`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })

    console.log('✅ Analytical summary generated successfully')
    return response.choices[0].message.content || 'Analysis not available'
    
  } catch (error: any) {
    console.error('❌ Analytical summary error:', error)
    return 'Unable to generate analysis at this time.'
  }
}

async function generateBasicSummary(products: ProductRecord[], query: string): Promise<string> {
  try {
    const systemPrompt = getSmartAISystemPrompt()
    
    const truncatedProducts = truncateProductData(products.slice(0, 3), 15000)
    const productsJson = JSON.stringify(truncatedProducts, null, 2)
    const estimatedTokens = estimateTokens(productsJson)
    
    console.log(`📝 Generating basic summary for ${truncatedProducts.length} products (~${estimatedTokens} tokens)`)
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Answer this question about sealants: ${query}\n\nAvailable products:\n${productsJson}`
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    })

    return response.choices[0].message.content || 'Summary not available'
    
  } catch (error: any) {
    console.error('❌ Basic summary error:', error)
    return 'Unable to generate summary at this time.'
  }
}

// ============================================================================
// MAIN HANDLERS
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const body = await request.json()
    const { query, filters, getFilterOptions } = body

    if (query === '__GET_FILTER_OPTIONS__' || getFilterOptions === true) {
      console.log('📥 Filter options request received')
      const result = await getFilterOptionsFromDB()
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(` POST /api/smart-search 200 in ${duration}s`)
      return NextResponse.json(result)
    }

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required and must be a string' },
        { status: 400 }
      )
    }

    console.log('🔍 Sealants Search Query:', query)
    console.log('🎛️ Filters:', filters)

    const metaCheck = detectMetaQuestion(query)
    if (metaCheck.isMeta) {
      const result = await handleMetaQuestion(query, metaCheck.type!, filters)
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(` POST /api/smart-search 200 in ${duration}s`)
      return result
    }

    const isComparison = isComparisonQuery(query)
    const isAnalytical = isAnalyticalQuery(query)
    const isCount = isCountQuery(query)

    console.log('📊 Query Type:', { isComparison, isAnalytical, isCount })

    let products = await searchProducts(query, filters)

    if (products.length === 0) {
      console.log('⚠️ No exact matches, trying fuzzy search...')
      const keywords = extractComparisonItems(query) || query.split(/\s+/).filter(w => w.length > 2)
      
      for (const keyword of keywords) {
        const fuzzyResults = await tryFuzzySearch(keyword)
        products.push(...fuzzyResults)
      }
      
      if (products.length > 0) {
        console.log(`✅ Fuzzy search found ${products.length} results`)
      }
    }

    if (products.length === 0) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(` POST /api/smart-search 200 in ${duration}s`)
      return NextResponse.json({
        questionType: 'none',
        products: [],
        summary: 'No sealant products found matching your search criteria.',
        count: 0
      })
    }

    if (isComparison) {
      console.log('📊 Comparison mode - matching products to keywords')
      
      const items = extractComparisonItems(query)
      if (items && items.length >= 2) {
        const normalize = (str: string): string => {
          return str.replace(/[\s_\-]/g, '').toUpperCase()
        }
        
        const productsByKeyword = new Map<string, ProductRecord[]>()
        
        items.forEach(keyword => {
          const normalizedKeyword = normalize(keyword)
          console.log(`  🔍 Looking for products matching: "${keyword}" (normalized: "${normalizedKeyword}")`)
          
          const matchingProducts = products.filter(product => {
            const productSKU = normalize(product.sku || '')
            const productName = normalize(product.product_name || product.Product_Name || '')
            const productFamily = normalize(product.family || '')
            const productModel = normalize(product.Product_Model || '')
            const productType = normalize(product.Product_Type || '')
            
            const matches = 
              productSKU === normalizedKeyword ||
              productSKU.includes(normalizedKeyword) ||
              productName === normalizedKeyword ||
              productName.includes(normalizedKeyword) ||
              productFamily === normalizedKeyword ||
              productFamily.includes(normalizedKeyword) ||
              productType === normalizedKeyword ||
              productType.includes(normalizedKeyword) ||
              productModel.includes(normalizedKeyword)
            
            if (matches) {
              console.log(`    ✅ Match found: SKU="${product.sku}", Name="${product.product_name || product.Product_Name}", Family="${product.family}"`)
            }
            
            return matches
          })
          
          if (matchingProducts.length > 0) {
            console.log(`    📦 Found ${matchingProducts.length} products for "${keyword}"`)
            productsByKeyword.set(keyword, matchingProducts)
          } else {
            console.log(`    ⚠️ No products found for "${keyword}"`)
          }
        })
        
        const comparisonProducts: ProductRecord[] = []
        productsByKeyword.forEach((prods, keyword) => {
          const normalizedKeyword = normalize(keyword)
          
          const sorted = prods.sort((a, b) => {
            const aSKU = normalize(a.sku || '')
            const bSKU = normalize(b.sku || '')
            
            if (aSKU === normalizedKeyword && bSKU !== normalizedKeyword) return -1
            if (bSKU === normalizedKeyword && aSKU !== normalizedKeyword) return 1
            if (aSKU.startsWith(normalizedKeyword) && !bSKU.startsWith(normalizedKeyword)) return -1
            if (bSKU.startsWith(normalizedKeyword) && !aSKU.startsWith(normalizedKeyword)) return 1
            
            return 0
          })
          
          comparisonProducts.push(sorted[0])
        })
        
        const uniqueProducts = Array.from(
          new Map(comparisonProducts.map(p => [normalize(p.sku || ''), p])).values()
        )
        
        console.log(`🎯 Final comparison: ${uniqueProducts.length} unique products`)
        
        if (uniqueProducts.length >= 2) {
          const comparisonSummary = await generateComparison(uniqueProducts, query)
          
          const duration = ((Date.now() - startTime) / 1000).toFixed(1)
          console.log(` POST /api/smart-search 200 in ${duration}s`)
          
          return NextResponse.json({
            questionType: 'comparison',
            products: uniqueProducts,
            comparisonSummary,
            count: uniqueProducts.length
          })
        } else {
          console.log(`⚠️ Only ${uniqueProducts.length} products matched, falling back to regular comparison`)
        }
      }
      
      const comparisonSummary = await generateComparison(products.slice(0, 5), query)
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(` POST /api/smart-search 200 in ${duration}s`)
      
      return NextResponse.json({
        questionType: 'comparison',
        products: products.slice(0, 5),
        comparisonSummary,
        count: products.length
      })
    }

    if (isAnalytical) {
      const summary = await generateAnalyticalSummary(products, query)
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(` POST /api/smart-search 200 in ${duration}s`)
      
      return NextResponse.json({
        questionType: 'analytical',
        summary,
        products: products.slice(0, 10),
        count: products.length
      })
    }

    if (isCount) {
      const summary = `Found **${products.length}** sealant product${products.length !== 1 ? 's' : ''} matching your search criteria.`
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(` POST /api/smart-search 200 in ${duration}s`)
      
      return NextResponse.json({
        questionType: 'count',
        summary,
        count: products.length,
        products: products.slice(0, 10)
      })
    }

    const keywords = query.split(/\s+/).filter(w => w.length > 2)
    const rankedProducts = rankSearchResults(products, keywords)
    
    const summary = await generateBasicSummary(rankedProducts, query)
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(` POST /api/smart-search 200 in ${duration}s`)
    
    return NextResponse.json({
      questionType: 'lookup',
      summary,
      products: rankedProducts.slice(0, 10),
      count: rankedProducts.length
    })

  } catch (error: any) {
    console.error('❌ Sealants search error:', error)
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(` POST /api/smart-search 500 in ${duration}s`)
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'Sealants Smart Search API',
    version: '2.0',
    features: [
      'Natural language search',
      'Product comparison with markdown tables',
      'Analytical queries',
      'Meta-questions',
      'Advanced filtering',
      'Fuzzy search fallback',
      'Smart product matching for comparisons',
      'Relevance ranking',
      'Token optimization'
    ]
  })
}