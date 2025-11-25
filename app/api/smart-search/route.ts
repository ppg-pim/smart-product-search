import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type ProductRecord = Record<string, any>

// ============================================================================
// SMART AI SYSTEM PROMPT - Flexible Field Discovery
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
  → Find fields that contain relevant information (e.g., "Cure_Time", "Curing", "Dry_Time")
  → Extract and present the exact values
  → If multiple related fields exist, show all of them
  
- **For comparison questions**:
  → **IMPORTANT: Use a clean, scannable format**
  → Start with a brief summary of key differences
  → Then show detailed comparison in sections
  → **DO NOT use wide tables** - they're hard to read
  → Use **side-by-side format** for 2 products
  → Use **grouped sections** for clarity
  → Highlight differences in **bold**
  → Show similarities briefly at the end
  
- **For "best for" questions** (e.g., "best sealant for firewall"):
  → Analyze application fields (Application, Use, Features, Benefits)
  → Look for specification matches (temperature, resistance, certifications)
  → Rank products by relevance to the specific use case
  → Explain WHY each product is suitable
  
- **For general questions**:
  → Provide an overview of key product characteristics
  → Focus on the most important/relevant fields
  → Explain technical specifications in context

**IMPORTANT RULES:**
1. **Don't assume field names** - The database structure may vary
2. **Search intelligently** - Look for keywords in field names:
   - Mix/ratio/mixing → mixing instructions
   - Cure/curing/dry → curing information
   - Temp/temperature → temperature specs
   - Apply/application → usage information
   - Spec/specification → technical specs
3. **Be thorough** - Check all fields, not just obvious ones
4. **Use natural field names** - Convert underscores to spaces (e.g., "Cure Time" not "Cure_Time")
5. **If data is missing** - Clearly state "This information is not available in the product data"
6. **Be precise** - Use exact values from the data, don't estimate or extrapolate
7. **Context matters** - For aerospace products, always consider:
   - Safety certifications (MIL-SPEC, FAA, etc.)
   - Temperature ranges (operating conditions)
   - Chemical resistance (fuel, hydraulic fluid, etc.)
   - Application method (brush, spray, etc.)

**FORMATTING:**
- Use markdown for readability
- Use **bold** for important specifications and differences
- **NEVER use wide tables for comparisons** - they're unreadable
- Use side-by-side format for 2-product comparisons
- Use grouped sections for multi-product comparisons
- Use dashes (-) for all lists, NOT bullet points (•)
- Keep answers concise but complete
- When citing field sources, use natural language (e.g., "according to the Cure Time specification" not "from Cure_Time field")

**AEROSPACE-SPECIFIC GUIDANCE:**
When recommending products for specific applications:
- **Firewall sealants**: Look for high temperature resistance (500°F+), flame resistance
- **Fuel tank sealants**: Look for fuel resistance, MIL-S-8802 or similar specs
- **Pressurized cabin**: Look for flexibility, adhesion, pressure resistance
- **Corrosion protection**: Look for primers, corrosion inhibitors
- **General purpose**: Look for versatility, ease of application

**COMPARISON FORMAT (2 PRODUCTS) - USE THIS TEMPLATE:**

**Quick Summary:**
[Brief 1-2 sentence overview of main differences]

**Key Differences:**

🔹 **[Specification Name]**
- Product A: [value]
- Product B: [value]

🔹 **[Specification Name]**
- Product A: [value]
- Product B: [value]

---

**Detailed Specifications:**

**Product 1: [Name/SKU]**
- Color: [value]
- Specification: [value]
- Pot Life: [value]
- Cure Time: [value]
- Temperature Range: [value]
- [other key specs...]

**Product 2: [Name/SKU]**
- Color: [value]
- Specification: [value]
- Pot Life: [value]
- Cure Time: [value]
- Temperature Range: [value]
- [other key specs...]

---

**Similarities:**
- [List common specifications]

**Recommendation:**
[When to use each product based on the differences]

---

**EXAMPLE COMPARISON (GOOD FORMAT):**

User: "Compare 0821X404XXCAZ05K vs 0821X404XX5PZ05K"

Good Answer:
"**Comparison: PPG KOROTHERM™ Thermal Protective Coating**

**Quick Summary:**
Both are identical KOROTHERM thermal protective coatings in 5 oz kits. The **only difference** is the specification standard: one meets PRC STANDARD while the other meets 5PTMMG01.

---

**Key Difference:**

🔹 **Specification Standard**
- **0821X404XXCAZ05K**: PRC STANDARD
- **0821X404XX5PZ05K**: 5PTMMG01

*(This may indicate different approval requirements or customer specifications)*

---

**Shared Specifications:**

**Product Details:**
- Product Type: Thermal Protective Coating
- Color: Whitish Gray
- Packaging: KIT, 5.00 oz Can
- Shelf Life: Store at 40°F (4.4°C)

**Application Properties:**
- Pot Life: 10 to 20 minutes
- Dry Hard: 90 to 120 minutes at 75°F (23.9°C)
- Full Cure: 7 days at 75°F (23.9°C)
- Mixing Ratio: 4 parts Base : 1 part Activator (by volume)
- Viscosity: 120 to 250 poise

**Performance:**
- Temperature Range: -65°F to +2,000°F (-54°C to +1,093°C)
- Flame Exposure: Backside temperature remains below 550°F (288°C)
- Humidity Resistance: 500 hours - Conforms
- Theoretical Coverage: 1400 ft²/gal at 1.0 mil dry film
- Dry Film Density: 0.0065 lbs/ft² at 1.0 mil

---

**Recommendation:**
Both products offer identical performance characteristics. Choose based on:
- **0821X404XXCAZ05K** if you need PRC STANDARD compliance
- **0821X404XX5PZ05K** if you need 5PTMMG01 compliance

Check with your engineering/quality department to determine which specification is required for your application."

---

**EXAMPLE FOR 3+ PRODUCTS:**

User: "Compare PS 870 Class A, Class B, and Class C"

Good Answer:
"**Comparison: PS 870 Sealant Family**

**Quick Summary:**
All three are PS 870 sealants meeting MIL-S-8802 specification. Main differences are color, density, and intended application.

---

**Key Differences:**

🔹 **Color**
- Class A: **White** (easy to inspect)
- Class B: **Black** (fuel system standard)
- Class C: **Gray** (general purpose)

🔹 **Specific Gravity**
- Class A: 1.35
- Class B: **1.45** (denser)
- Class C: 1.40

🔹 **Primary Application**
- Class A: General airframe sealing, visible areas
- Class B: **Fuel tank and fuel system sealing**
- Class C: General purpose, intermediate visibility

---

**Shared Specifications:**
- Temperature Range: -65°F to 250°F
- Cure Time: 7 days at 77°F
- Specification: MIL-S-8802
- Application Methods: Brush, extrusion, spatula
- Tack Free Time: 1-2 hours at 77°F

---

**Recommendation:**
- Use **Class A** for general airframe where white color helps with inspection
- Use **Class B** for all fuel system applications (required by spec)
- Use **Class C** when color is less critical but you need general sealing"

---

Remember: Your goal is to make comparisons **easy to scan and understand**. Avoid wide tables. Use clear sections and highlight what actually matters to the user.`
}

// ============================================================================
// HELPER: Generate search variations for product codes
// ============================================================================

function generateSearchVariations(productCode: string): string[] {
  const variations = new Set<string>()
  
  // Original
  variations.add(productCode)
  
  // Remove all spaces and special chars
  const cleaned = productCode.replace(/[\s\-\/®™©]/g, '')
  if (cleaned.length >= 2) {
    variations.add(cleaned)
  }
  
  // Extract just the number
  const numberMatch = productCode.match(/(\d+)/)
  if (numberMatch && numberMatch[1].length >= 2) {
    variations.add(numberMatch[1])
  }
  
  // Common patterns
  const patterns = [
    productCode.replace(/\//g, ''),           // P/S510 → PS510
    productCode.replace(/\//g, ' '),          // P/S510 → P S510
    productCode.replace(/([A-Z\/]+)(\d+)/i, '$1 $2'), // P/S510 → P/S 510
    productCode.replace(/\//g, '').replace(/([A-Z]+)(\d+)/i, '$1 $2'), // P/S510 → PS 510
    productCode.replace(/[\s\-]/g, ''),       // Remove spaces and dashes
  ]
  
  patterns.forEach(p => {
    if (p.length >= 2) {
      variations.add(p)
    }
  })
  
  // Filter out very short terms (less than 2 chars)
  return Array.from(variations).filter(v => v.length >= 2)
}

// ============================================================================
// META-QUESTION DETECTION
// ============================================================================

function detectMetaQuestion(query: string): { isMeta: boolean; type: string | null } {
  const lowerQuery = query.toLowerCase().trim()
  
  // Check if query mentions specific product (PS 870, PR-1422, etc.)
  const hasSpecificProduct = /\b(ps|p\/s|pr|korotherm|class|[a-z]{2,}\s*\d{3,}|\d{3,})\b/i.test(query)
  
  // Count questions - BUT ONLY if no specific product/filter is mentioned
  if (
    (lowerQuery.match(/^how many (products?|items?|sealants?|entries?)(\s+(are|do|in))?$/) ||
    lowerQuery.match(/^total (number of )?(products?|items?|sealants?)$/) ||
    lowerQuery.match(/^count (of )?(products?|items?|sealants?)$/)) &&
    !hasSpecificProduct
  ) {
    console.log('🎯 Detected generic count query (no specific product)')
    return { isMeta: true, type: 'count' }
  }
  
  // List families/types questions
  if (
    lowerQuery.match(/what (are the |kinds of |types of )?(families|family|types?|categories)/) ||
    lowerQuery.match(/list (all )?(families|family|types?|categories|products?)/) ||
    lowerQuery.match(/show (me )?(all )?(families|family|types?|categories)/)
  ) {
    return { isMeta: true, type: 'list' }
  }
  
  // Database info questions
  if (
    lowerQuery.match(/what('s| is) in (the |this )?database/) ||
    lowerQuery.match(/tell me about (the |this )?database/) ||
    lowerQuery.match(/database (info|information|overview|summary)/)
  ) {
    return { isMeta: true, type: 'overview' }
  }
  
  return { isMeta: false, type: null }
}

// ============================================================================
// COUNT QUERY DETECTION (for specific products)
// ============================================================================

function isCountQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim()
  return (
    lowerQuery.startsWith('how many') ||
    lowerQuery.startsWith('count') ||
    lowerQuery.includes('how many products') ||
    lowerQuery.includes('total number of')
  )
}

async function handleMetaQuestion(
  type: string,
  query: string,
  filters: any
): Promise<any> {
  console.log(`🔍 Handling meta-question type: ${type}`)
  
  try {
    if (type === 'count') {
      // Build query with filters
      let countQuery = supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
      
      // Apply user filters
      if (filters?.family) countQuery = countQuery.eq('family', filters.family)
      if (filters?.productType) countQuery = countQuery.eq('product_type', filters.productType)
      if (filters?.specification) countQuery = countQuery.eq('specification', filters.specification)
      
      // Check if query mentions specific category (e.g., "sealants")
      const lowerQuery = query.toLowerCase()
      if (lowerQuery.includes('sealant')) {
        countQuery = countQuery.or(
          'categories.ilike.%Sealants%,' +
          'family.ilike.%Sealant%,' +
          'product_type.ilike.%Sealant%,' +
          'searchable_text.ilike.%Sealant%'
        )
      }
      
      const { count, error } = await countQuery
      
      if (error) {
        console.error('❌ Error counting products:', error)
        throw error
      }
      
      console.log(`✅ Total products: ${count}`)
      
      const filterText = filters?.family || filters?.productType || filters?.specification
        ? ` with applied filters`
        : ''
      
      const categoryText = lowerQuery.includes('sealant') ? ' in Sealants category' : ''
      
      const summary = `**Product Count${categoryText}**

I found **${(count || 0).toLocaleString()} products**${categoryText}${filterText}.

${count && count > 100 ? 'You can use filters or search for specific products to narrow down the results.' : ''}`
      
      return {
        success: true,
        questionType: 'meta',
        metaType: 'count',
        summary,
        count: count || 0,
        results: []
      }
    }
    
    if (type === 'list') {
      // Get unique families, types, and specifications
      const { data: familyData } = await supabase
        .from('products')
        .select('family')
        .not('family', 'is', null)
        .limit(1000)
      
      const { data: typeData } = await supabase
        .from('products')
        .select('product_type')
        .not('product_type', 'is', null)
        .limit(1000)
      
      const families = [...new Set(familyData?.map((r: any) => r.family).filter(Boolean))].sort()
      const types = [...new Set(typeData?.map((r: any) => r.product_type).filter(Boolean))].sort()
      
      console.log(`✅ Found ${families.length} families, ${types.length} types`)
      
      const summary = `**Product Categories Overview**

**Product Families (${families.length} total):**
${families.slice(0, 20).map(f => `- ${f}`).join('\n')}
${families.length > 20 ? `\n_...and ${families.length - 20} more_` : ''}

**Product Types (${types.length} total):**
${types.slice(0, 15).map(t => `- ${t}`).join('\n')}
${types.length > 15 ? `\n_...and ${types.length - 15} more_` : ''}

You can filter by any of these categories using the filter options in the search interface.`
      
      return {
        success: true,
        questionType: 'meta',
        metaType: 'list',
        summary,
        families,
        types,
        results: []
      }
    }
    
    if (type === 'overview') {
      // Get comprehensive database overview
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
      
      const { data: familyData } = await supabase
        .from('products')
        .select('family')
        .not('family', 'is', null)
        .limit(500)
      
      const families = [...new Set(familyData?.map((r: any) => r.family).filter(Boolean))]
      
      const summary = `**Aerospace Sealants Database Overview**

**Total Products:** ${(count || 0).toLocaleString()} aerospace sealant products

**Product Families:** ${families.length} unique families including ${families.slice(0, 5).join(', ')}, and more.

**Search Capabilities:**
- Natural language search across all product specifications
- Compare products side-by-side
- Filter by family, type, and specification
- AI-powered product recommendations

**Example Queries:**
- "Best sealant for firewall application"
- "Compare PS 870 vs PR 1422"
- "Show me all primers"
- "What products are in the Korotherm family?"`
      
      return {
        success: true,
        questionType: 'meta',
        metaType: 'overview',
        summary,
        totalCount: count || 0,
        familyCount: families.length,
        results: []
      }
    }
    
  } catch (error: any) {
    console.error('❌ Meta-question handler error:', error)
    throw error
  }
  
  return null
}

// ============================================================================
// HTML STRIPPING & DATA CLEANING
// ============================================================================

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

// ============================================================================
// PRODUCT RELEVANCE SCORING
// ============================================================================

function scoreProductRelevance(product: ProductRecord, keywords: string[]): number {
  let score = 0
  const productText = JSON.stringify(product).toLowerCase()
  
  keywords.forEach(keyword => {
    const lowerKeyword = keyword.toLowerCase()
    const keywordCount = (productText.match(new RegExp(lowerKeyword, 'g')) || []).length
    
    const sku = (product.sku || '').toLowerCase()
    const name = (product.product_name || product.name || '').toLowerCase()
    const description = (product.description || '').toLowerCase()
    const application = (product.application || product.Application || '').toLowerCase()
    const family = (product.family || product.Family || '').toLowerCase()
    
    if (sku.includes(lowerKeyword)) score += 50
    if (name.includes(lowerKeyword)) score += 30
    if (family.includes(lowerKeyword)) score += 25
    if (application.includes(lowerKeyword)) score += 20
    if (description.includes(lowerKeyword)) score += 10
    
    score += keywordCount * 2
  })
  
  return score
}

// ============================================================================
// COMPLETE DATA PREPARATION - Send Everything to AI
// ============================================================================

function prepareCompleteProductDataForAI(products: ProductRecord[]): string {
  const productDataStrings = products.map((product, index) => {
    const lines: string[] = []
    lines.push(`\n${'='.repeat(80)}`)
    lines.push(`PRODUCT ${index + 1}`)
    lines.push('='.repeat(80))
    
    // Send ALL fields to AI - let it discover what's relevant
    Object.entries(product).forEach(([key, value]) => {
      // Skip only truly irrelevant fields
      if (key === 'embedding' || key === 'id' || key === 'created_at') {
        return
      }
      
      if (value !== null && value !== undefined && value !== '') {
        // Convert field name to human-readable format
        const readableKey = key
          .replace(/_/g, ' ')
          .replace(/([A-Z])/g, ' $1')
          .trim()
          .replace(/\s+/g, ' ')
        
        // Limit individual field length but keep complete
        const valueStr = String(value).substring(0, 2000)
        lines.push(`${readableKey}: ${valueStr}`)
      }
    })
    
    // Also include all_attributes if present (already merged in cleanProductData)
    
    return lines.join('\n')
  })
  
  return productDataStrings.join('\n\n')
}

// ============================================================================
// SMART AI ANALYSIS - Flexible & Adaptive
// ============================================================================

async function generateSmartAISummary(
  query: string, 
  products: ProductRecord[],
  questionType: 'list' | 'count' | 'specific_ai' | 'comparison' | 'analytical' = 'analytical'
): Promise<string> {
  try {
    // Limit products to avoid token limits
    const productsToAnalyze = products.slice(0, 10)
    const completeProductData = prepareCompleteProductDataForAI(productsToAnalyze)
    
    // Estimate tokens (rough: 1 token ≈ 4 characters)
    const estimatedTokens = completeProductData.length / 4
    
    console.log(`🤖 Generating Smart AI summary:`)
    console.log(`   - Products: ${productsToAnalyze.length}`)
    console.log(`   - Data size: ${completeProductData.length} chars`)
    console.log(`   - Est. tokens: ${Math.round(estimatedTokens)}`)
    console.log(`   - Question type: ${questionType}`)
    
    // If data is too large, reduce products
    if (estimatedTokens > 25000) {
      console.warn(`⚠️ Data too large (${estimatedTokens} tokens), reducing to 5 products`)
      return await generateSmartAISummary(query, products.slice(0, 5), questionType)
    }
    
    // Create context hint based on question type
    let contextHint = ''
    if (questionType === 'comparison') {
      contextHint = '\n\n**USER INTENT:** The user wants to compare these products. Focus on finding differences and similarities. Use a comparison table if comparing 3+ specifications.'
    } else if (questionType === 'analytical' || questionType === 'specific_ai') {
      contextHint = '\n\n**USER INTENT:** The user is asking an analytical question. Provide detailed insights, recommendations, and explain WHY certain products are suitable.'
    } else if (questionType === 'list') {
      contextHint = '\n\n**USER INTENT:** The user is looking up product information. Provide a clear, informative overview of the product(s).'
    } else if (questionType === 'count') {
      contextHint = '\n\n**USER INTENT:** The user wants to know how many products match certain criteria. Provide the count and summarize the product range.'
    }
    
    const summaryCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: getSmartAISystemPrompt()
        },
        {
          role: 'user',
          content: `${contextHint}

**USER QUESTION:**
${query}

**PRODUCT DATA:**
${completeProductData}

Please analyze the product data above and answer the user's question. Remember to:
1. Search through ALL fields to find relevant information
2. When citing field names, convert underscores to spaces naturally
3. Use dashes (-) for all lists, NOT bullet points (•)
4. Be specific and accurate - use exact values from the data
5. If information doesn't exist in the data, say so clearly
6. For "best for" questions, analyze ALL products and rank by suitability
7. Explain your reasoning with technical justification`
        }
      ],
      temperature: 0.2, // Lower temperature for factual accuracy
      max_tokens: 2500
    })
    
    let summary = summaryCompletion.choices[0].message.content || 'Unable to generate summary'
    
    // Clean up any remaining HTML
    summary = stripHtml(summary)
    
    console.log(`✅ Smart AI summary generated (${summary.length} chars)`)
    
    return summary
    
  } catch (error: any) {
    console.error('❌ Smart AI summary generation error:', error.message)
    
    // Retry with fewer products if token error
    if (error.message?.includes('tokens') && products.length > 5) {
      console.log('🔄 Retrying with fewer products...')
      return await generateSmartAISummary(query, products.slice(0, 5), questionType)
    }
    
    // Fallback response
    return `I found ${products.length} product(s) matching your search. Here are the key details:

${products.slice(0, 3).map((p, i) => `
**${i + 1}. ${p.product_name || p.name || p.sku || 'Product'}**
${p.description ? `- ${stripHtml(String(p.description)).substring(0, 200)}...` : ''}
${p.family ? `- Family: ${p.family}` : ''}
${p.specification ? `- Specification: ${p.specification}` : ''}
`).join('\n')}

${products.length > 3 ? `\n_...and ${products.length - 3} more products_` : ''}

Please review the detailed product information below for complete specifications.`
  }
}

// ============================================================================
// SMART COMPARISON ANALYSIS
// ============================================================================

async function generateSmartComparisonAnalysis(
  query: string, 
  products: ProductRecord[], 
  comparisonType: string
): Promise<string> {
  try {
    const productsData = prepareCompleteProductDataForAI(products)
    
    console.log(`Generating smart comparison analysis:`)
    console.log(`   - Products: ${products.length}`)
    console.log(`   - Comparison type: ${comparisonType}`)
    console.log(`   - Data size: ${productsData.length} chars`)
    
    const comparisonCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: getSmartAISystemPrompt()
        },
        {
          role: 'user',
			content: `**USER INTENT:** The user wants to compare these ${products.length} products.

**COMPARISON TYPE:** ${comparisonType}

**USER QUESTION:**
${query}

**PRODUCTS TO COMPARE:**
${productsData}

Please provide a detailed comparison analysis:
${products.length === 2 ? 
`
1. **Create a side-by-side comparison** for key specifications
2. **Highlight key differences** - What makes each product unique
3. **Note similarities** - What they have in common
4. **Explain use cases** - When to use each product
5. **Make recommendations** - Which product is best for specific applications
` : 
`
1. **Start with a quick summary** of the main differences
2. **Group by specification categories** (e.g., Physical Properties, Performance, Application)
3. **Highlight key differences** for each category
4. **Note similarities** - What they all have in common
5. **Make recommendations** - Which product is best for specific applications

**IMPORTANT FOR ${products.length} PRODUCTS:**
- DO NOT use wide tables
- Use grouped sections with clear headings
- Show differences in a scannable format
- Use side-by-side format within each section
- Make it easy to compare all ${products.length} products at once
`}

Remember:
- Search through ALL fields to find comparable data
- Use natural field names (spaces, not underscores)
- Use dashes (-) for lists, NOT bullet points (•)
- Be specific and cite actual values
- Explain WHY differences matter for the end user`
        }
      ],
      temperature: 0.2,
      max_tokens: 3000
    })
    
    let analysis = comparisonCompletion.choices[0].message.content || 'Unable to generate comparison'
    analysis = stripHtml(analysis)
    
    console.log(`✅ Smart comparison analysis generated (${analysis.length} chars)`)
    
    return analysis
    
  } catch (error: any) {
    console.error('❌ Smart comparison analysis error:', error.message)
    
    // Fallback comparison
    return `**Product Comparison**

I found ${products.length} products to compare. Here's a basic overview:

${products.map((p, i) => `
**${i + 1}. ${p.product_name || p.name || p.sku || 'Product'}**
- Family: ${p.family || 'N/A'}
- Type: ${p.product_type || 'N/A'}
- Specification: ${p.specification || 'N/A'}
`).join('\n')}

Please review the detailed comparison table below for complete specifications.`
  }
}

function detectComparisonType(products: ProductRecord[]): string {
  if (products.length < 2) return 'general'
  
  console.log(`🔍 Detecting comparison type for ${products.length} products`)
  
  const families = products.map(p => p.family || p.Family || p.product_family || '').filter(Boolean)
  const uniqueFamilies = new Set(families)
  if (uniqueFamilies.size > 1 && uniqueFamilies.size === products.length) {
    console.log(`✅ Different families detected - treating as family comparison`)
    return 'family'
  }
  
  const types = products.map(p => p.product_type || p.productType || p.type || '').filter(Boolean)
  const uniqueTypes = new Set(types)
  if (uniqueTypes.size > 1 && uniqueTypes.size === products.length) {
    console.log(`✅ Different types detected - treating as product_type comparison`)
    return 'product_type'
  }
  
  const specs = products.map(p => p.specification || p.Specification || p.spec || '').filter(Boolean)
  const uniqueSpecs = new Set(specs)
  if (uniqueSpecs.size > 1 && uniqueSpecs.size === products.length) {
    console.log(`✅ Different specifications detected - treating as specification comparison`)
    return 'specification'
  }
  
  console.log(`✅ Treating as general product comparison`)
  return 'general'
}

// ============================================================================
// DATABASE QUERY HELPERS
// ============================================================================

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

function applyUserFilters(dbQuery: any, filters: any, columns: string[], allProducts: any[]) {
  if (!filters) return dbQuery

  if (filters.family) {
    const familyColumns = ['family', 'Family', 'product_family', 'productFamily'].filter(col => columns.includes(col))
    
    if (familyColumns.length > 0) {
      dbQuery = dbQuery.eq(familyColumns[0], filters.family)
      console.log(`🎯 Applied family filter on column "${familyColumns[0]}": ${filters.family}`)
    } else {
      console.log(`⚠️ Family column not found in DB, will filter in memory`)
    }
  }

  if (filters.productType) {
    const typeColumns = ['product_type', 'productType', 'type', 'Type', 'category', 'Category'].filter(col => columns.includes(col))
    
    if (typeColumns.length > 0) {
      dbQuery = dbQuery.eq(typeColumns[0], filters.productType)
      console.log(`🎯 Applied product type filter on column "${typeColumns[0]}": ${filters.productType}`)
    } else {
      console.log(`⚠️ Product type column not found in DB, will filter in memory`)
    }
  }

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

function filterProductsInMemory(products: any[], filters: any): any[] {
  if (!filters) return products

  return products.filter(product => {
    let matches = true

    if (filters.family) {
      const familyValue = product.family || product.Family || product.product_family || product.productFamily
      const attrFamily = product.all_attributes?.family || product.all_attributes?.Family
      
      if (familyValue !== filters.family && attrFamily !== filters.family) {
        matches = false
      }
    }

    if (filters.productType) {
      const typeValue = product.product_type || product.productType || product.type || product.Type || product.category || product.Category
      const attrType = product.all_attributes?.product_type || product.all_attributes?.type
      
      if (typeValue !== filters.productType && attrType !== filters.productType) {
        matches = false
      }
    }

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

// ============================================================================
// MAIN POST HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, filters, getFilterOptions } = body

    // ========================================================================
    // FILTER OPTIONS REQUEST
    // ========================================================================
    
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
          const familyValue = product.family || product.Family || product.product_family || product.productFamily
          if (familyValue && String(familyValue).trim()) {
            families.add(String(familyValue).trim())
          }

          const typeValue = product.product_type || product.productType || product.type || product.Type || product.category || product.Category
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

    // ========================================================================
    // VALIDATE QUERY
    // ========================================================================
    
    if (!query) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }

    console.log('🔍 User query:', query)
    console.log('🎯 Applied filters:', filters)

    // ========================================================================
    // CHECK FOR META-QUESTIONS (count, list, overview)
    // ========================================================================
    
    const metaCheck = detectMetaQuestion(query)
    if (metaCheck.isMeta && metaCheck.type) {
      console.log(`🎯 Detected meta-question type: ${metaCheck.type}`)
      const metaResult = await handleMetaQuestion(metaCheck.type, query, filters)
      if (metaResult) {
        return NextResponse.json(metaResult)
      }
    }

    // ========================================================================
    // STEP 1: GET DATABASE SCHEMA
    // ========================================================================
    
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

    // ========================================================================
    // STEP 2: USE GPT-4O-MINI TO UNDERSTAND QUERY
    // ========================================================================
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a smart database search assistant for aerospace sealant products. Analyze user queries and generate appropriate database filters.

DATABASE SCHEMA:
Columns: ${columns.join(', ')}

SAMPLE DATA STRUCTURE:
${JSON.stringify(samplePreview, null, 2)}

USER APPLIED FILTERS:
${filters ? JSON.stringify(filters, null, 2) : 'None'}

IMPORTANT NOTES:
- The "searchable_text" column contains ALL product information (flattened from all_attributes)
- Product identifiers can be in "sku", "product_name", "name", or "family" columns
- Products may have variants (e.g., "P/S 870 Class A", "P/S 870 Class B", "P/S 870 Class C")
- When user asks for a product family (e.g., "PS 870" or "P/S510"), show ALL variants
- Product codes may have spaces, slashes, or special characters (e.g., "P/S 510®", "PS510", "P/S-510")
- For product name queries, search JUST THE NUMBER to catch all variations
- If user has applied filters (family, productType, specification), incorporate them into the search

QUESTION TYPE DETECTION:

1. **COUNT QUESTIONS** (how many, count, total number):
 - Set questionType: "count"
 - Extract JUST THE NUMBER from product name
 - Search in: sku, product_name, family, searchable_text
 - Use "any" searchType (OR logic)
 - Set limit: 500 (reasonable for counting)

2. **ANALYTICAL QUESTIONS** (why, how, what makes, explain, tell me about, what is, advantages, benefits, uses, best, recommend, which product):
 - Set questionType: "analytical"
 - These require AI-generated summaries based on product data
 - Examples: "Why use Korotherm?", "What are the benefits of PS 870?", "Which product is best for firewall?", "What is P/S510?"
 - **CRITICAL: For product family queries (e.g., "what is P/S510"), extract JUST THE NUMBER:**
   - "P/S510" → search for "510"
   - "PS 870" → search for "870"
   - "PR-1422" → search for "1422"
 - Search in: sku, product_name, name, family, searchable_text
 - Use "any" searchType (OR logic)
 - Set limit: 50 (manageable for AI analysis)

3. **SINGLE PRODUCT QUERY** (e.g., "PS 870", "PR-148", "P/S510"):
 - Set questionType: "list"
 - Extract JUST THE NUMBER: "PS 870" → "870", "P/S510" → "510"
 - Search in: sku, product_name, name, family, searchable_text
 - Use "any" searchType to find ALL variants
 - Set limit: 500

4. **COMPARISON QUERIES** ("difference", "different", "compare", "comparison", "vs", "versus", "between"):
 - Set questionType: "comparison"
 - Extract ALL product identifiers (just numbers) - e.g., ["890F", "890N", "890M", "890"]
 - Add them to compareProducts array
 - Create filters for EACH product
 - Search in: sku, product_name, name, family, searchable_text
 - Use "any" searchType (OR logic)
 - Set limit: 500
 - **IMPORTANT:** Extract ALL product codes mentioned, not just 2


5. **ATTRIBUTE QUESTIONS** ("what is the [attribute] of [product]"):
 - Set questionType: "specific_ai"
 - Extract just the number from product name
 - Let AI extract the specific attribute from results
 - Set limit: 5

6. **APPLICATION-BASED QUERIES** ("best for [application]", "product for [use]"):
 - Set questionType: "analytical"
 - Extract PRIMARY keyword (e.g., "firewall", "fuel tank")
 - Search in: sku, product_name, name, description, application, searchable_text
 - Set limit: 100
 - Use "any" searchType

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
  "questionType": "list" | "count" | "specific_ai" | "comparison" | "analytical",
  "attributeQuestion": "extracted question",
  "compareProducts": ["product1", "product2"],
  "limit": null | number,
  "searchKeywords": ["keyword1", "keyword2"]
}

CRITICAL RULES:
- For product name queries, extract JUST THE NUMBER (e.g., "P/S510" → "510")
- This catches all variations: "P/S 510®", "PS510", "P/S-510", "PS 510"
- Always include "family" column in searches
- Use wildcards: %510% will match anywhere in the text
- For "what is [product]" queries, use questionType: "analytical"
- ALWAYS set a limit (500 for count/list, 100 for analytical, 50 for specific)

EXAMPLES:

Query: "how many products are ps 890"
Response:
{
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%890%"},
    {"column": "product_name", "operator": "ilike", "value": "%890%"},
    {"column": "family", "operator": "ilike", "value": "%890%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%890%"}
  ],
  "searchType": "any",
  "questionType": "count",
  "limit": 500,
  "searchKeywords": ["890", "PS 890", "P/S 890"]
}

Query: "what is P/S510 sealant"
Response:
{
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%510%"},
    {"column": "product_name", "operator": "ilike", "value": "%510%"},
    {"column": "family", "operator": "ilike", "value": "%510%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%510%"}
  ],
  "searchType": "any",
  "questionType": "analytical",
  "limit": 50,
  "searchKeywords": ["510", "P/S 510", "PS510"]
}

Query: "Tell me about PS 870"
Response:
{
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%870%"},
    {"column": "product_name", "operator": "ilike", "value": "%870%"},
    {"column": "family", "operator": "ilike", "value": "%870%"},
    {"column": "searchable_text", "operator": "ilike", "value": "%870%"}
  ],
  "searchType": "any",
  "questionType": "analytical",
  "limit": 50,
  "searchKeywords": ["870", "PS 870", "P/S 870"]
}

Query: "Which product is best for firewall sealant?"
Response:
{
  "filters": [
    {"column": "sku", "operator": "ilike", "value": "%firewall%"},
    {"column": "product_name", "operator": "ilike", "value": "%firewall%"},
    {"column": "description", "operator": "ilike", "value": "%firewall%"},
    {"column": "application", "operator": "ilike", "value": "%firewall%"},
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
      searchParams = JSON.parse(completion.choices[0].message.content || '{"filters": [], "searchType": "any", "questionType": "list", "limit": 500}')
    } catch (parseError) {
      console.error('❌ Failed to parse GPT response:', completion.choices[0].message.content)
      searchParams = { filters: [], searchType: "any", questionType: "list", limit: 500 }
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

    // ========================================================================
    // STEP 3: BUILD SUPABASE QUERY
    // ========================================================================
    
    let dbQuery: any = supabase.from('products').select('*')

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

    // ========================================================================
    // APPLY LIMIT & EXECUTE QUERY (except for count queries)
    // ========================================================================
    
    let cleanedResults: ProductRecord[] = []
    
    if (!isCountQuery(query)) {
      const limit = searchParams.limit || 100
      dbQuery = dbQuery.limit(limit)
      console.log(`📊 Applying limit: ${limit}`)
      
      console.log('🔍 Executing database query...')
      
      const { data: products, error: queryError } = await dbQuery
      
      if (queryError) {
        console.error('❌ Query error:', queryError)
        throw new Error(`Database query failed: ${queryError.message}`)
      }
      
      console.log(`✅ Found ${products?.length || 0} products`)
      
      // Apply in-memory filters if needed
      let filteredProducts = products || []
      if (filters && (filters.family || filters.productType || filters.specification)) {
        const beforeFilter = filteredProducts.length
        filteredProducts = filterProductsInMemory(filteredProducts, filters)
        console.log(`🔍 In-memory filter: ${beforeFilter} → ${filteredProducts.length} products`)
      }
      
      // Clean and score products
      cleanedResults = filteredProducts.map((p: any) => cleanProductData(p))
      
      // Score and sort by relevance if we have search keywords
      if (searchParams.searchKeywords && searchParams.searchKeywords.length > 0) {
        cleanedResults = cleanedResults
          .map((p: ProductRecord) => ({
            ...p,
            _relevanceScore: scoreProductRelevance(p, searchParams.searchKeywords)
          }))
          .sort((a: any, b: any) => b._relevanceScore - a._relevanceScore)
          .map((p: any) => {
            const { _relevanceScore, ...rest } = p
            return rest
          })
        
        console.log(`✅ Sorted ${cleanedResults.length} products by relevance`)
      }
    }

    // ========================================================================
    // OPTIMIZE FOR COUNT QUERIES - USE SUPABASE COUNT
    // ========================================================================

    if (isCountQuery(query)) {
      console.log('🔢 Count query detected - using Supabase count feature')
      searchParams.questionType = "count"
      
      // Build count query with timeout protection
      const countPromise = (async () => {
        let countQuery: any = supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
        
        // Apply user filters
        countQuery = applyUserFilters(countQuery, filters, columns, [])
        
        // Apply search filters
        if (searchParams.filters.length > 0) {
          if (searchParams.searchType === "any") {
            const orConditionString = buildOrConditions(searchParams.filters, columns)
            if (orConditionString) {
              countQuery = countQuery.or(orConditionString)
              console.log('✅ OR conditions applied for count:', orConditionString)
            }
          } else {
            const validFilters = searchParams.filters.filter((filter: any) => 
              columns.includes(filter.column)
            )
            
            for (const filter of validFilters) {
              const { column, operator, value } = filter
              
              switch (operator) {
                case 'eq':
                  countQuery = countQuery.eq(column, value)
                  break
                case 'ilike':
                  countQuery = countQuery.ilike(column, value)
                  break
                case 'gt':
                  countQuery = countQuery.gt(column, value)
                  break
                case 'lt':
                  countQuery = countQuery.lt(column, value)
                  break
                case 'gte':
                  countQuery = countQuery.gte(column, value)
                  break
                case 'lte':
                  countQuery = countQuery.lte(column, value)
                  break
              }
            }
          }
        }
        
        return await countQuery
      })()
      
      // Add timeout (30 seconds)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Count query timeout')), 30000)
      )
      
      try {
        const { count, error: countError } = await Promise.race([countPromise, timeoutPromise]) as any
        
        if (countError) {
          console.error('❌ Count query error:', countError)
          throw new Error(`Count error: ${countError.message}`)
        }
        
        console.log(`✅ Total count: ${count}`)
        
        // =====================================================================
        // FETCH ALL MATCHING PRODUCTS (handle pagination for > 1000 results)
        // =====================================================================
        
        const maxResults = Math.min(count || 0, 3000) // Cap at 3000 for performance
        const batchSize = 1000 // Supabase max per request
        let allProducts: any[] = []
        
        // Calculate number of batches needed
        const numBatches = Math.ceil(maxResults / batchSize)
        
        console.log(`📦 Fetching ${maxResults} products in ${numBatches} batch(es)...`)
        
        // Fetch in batches
        for (let i = 0; i < numBatches; i++) {
          const offset = i * batchSize
          const limit = Math.min(batchSize, maxResults - offset)
          
          let batchQuery = supabase.from('products').select('*')
          batchQuery = applyUserFilters(batchQuery, filters, columns, [])
          
          if (searchParams.filters.length > 0 && searchParams.searchType === "any") {
            const orConditionString = buildOrConditions(searchParams.filters, columns)
            if (orConditionString) {
              batchQuery = batchQuery.or(orConditionString)
            }
          }
          
          // Apply pagination
          batchQuery = batchQuery.range(offset, offset + limit - 1)
          
          const { data: batchData, error: fetchError } = await batchQuery
          
          if (fetchError) {
            console.error(`❌ Error fetching batch ${i + 1}:`, fetchError)
            throw new Error(`Fetch error: ${fetchError.message}`)
          }
          
          if (batchData && batchData.length > 0) {
            allProducts = allProducts.concat(batchData)
            console.log(`✅ Fetched batch ${i + 1}/${numBatches}: ${batchData.length} products (total: ${allProducts.length})`)
          }
          
          // Stop if we got fewer results than expected (no more data)
          if (!batchData || batchData.length < limit) {
            break
          }
        }
        
        console.log(`✅ Total fetched: ${allProducts.length} products`)
        
        // Clean the products
        cleanedResults = allProducts.map((p: any) => cleanProductData(p))
        
        // Get unique families for summary
        const families = new Set<string>()
        cleanedResults.forEach((p: any) => {
          const family = p.family || p.Family || p.product_family
          if (family) families.add(family)
        })
        
        const familyList = Array.from(families).slice(0, 10) // Show top 10 families
        const productContext = searchParams.searchKeywords?.join(', ') || 'in the system'
        
        const familyText = familyList.length > 0 
          ? `\n\n**Product Families Found:**\n${familyList.map(f => `- ${f}`).join('\n')}${families.size > 10 ? `\n_...and ${families.size - 10} more families_` : ''}`
          : ''
        
        const limitWarning = count && count > maxResults 
          ? `\n\n⚠️ **Note:** The table below shows the first ${maxResults.toLocaleString()} results for performance. Use filters to narrow down your search if you need specific products.`
          : ''
        
        // FIX: Use 'count' (actual total) instead of cleanedResults.length
        const totalCount = count || 0
        const displayedCount = cleanedResults.length
        
        // =====================================================================
        // GENERATE AI ANALYSIS FOR COUNT QUERY
        // =====================================================================
        
        console.log('🤖 Generating AI analysis for count query...')
        
        const contextForAI = `The user asked: "${query}"

TOTAL PRODUCTS: ${totalCount.toLocaleString()}

PRODUCT FAMILIES (${families.size} total):
${familyList.map(f => `- ${f}`).join('\n')}${families.size > 10 ? `\n...and ${families.size - 10} more families` : ''}

SAMPLE PRODUCTS (first 5 for reference):
${JSON.stringify(cleanedResults.slice(0, 5), null, 2)}

Please provide a clear, informative answer about the total product count and give an overview of what types of products are available.`

        try {
          const aiCompletion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: getSmartAISystemPrompt()
              },
              {
                role: 'user',
                content: contextForAI
              }
            ],
            temperature: 0.2,
            max_tokens: 1500
          })

          let aiSummary = aiCompletion.choices[0].message.content || 'Unable to generate summary'
          aiSummary = stripHtml(aiSummary)
          
          console.log('✅ AI analysis generated for count query')

          return NextResponse.json({
            success: true,
            questionType: "count",
            summary: aiSummary,  // ✅ AI-generated summary
            count: totalCount,
            results: cleanedResults,
            totalResults: totalCount,
            displayedResults: displayedCount,
            families: Array.from(families),
            limitApplied: totalCount > maxResults,
            metadata: {
              totalCount: totalCount,
              displayedCount: displayedCount,
              familyCount: families.size
            }
          })
          
        } catch (aiError: any) {
          console.error('❌ AI Error for count query:', aiError)
          
          // Fallback to template if AI fails
          const fallbackSummary = `**Product Count**

I found **${totalCount.toLocaleString()} product(s)** in the system.

**Product Families Found (${families.size} total):**
${familyList.map(f => `- ${f}`).join('\n')}${families.size > 10 ? `\n_...and ${families.size - 10} more families_` : ''}

${displayedCount < totalCount ? `⚠️ **Note:** The table below shows the first ${displayedCount.toLocaleString()} results for performance. Use filters to narrow down your search if you need specific products.` : ''}

You can view all products in the results table below.`

          return NextResponse.json({
            success: true,
            questionType: "count",
            summary: fallbackSummary,
            count: totalCount,
            results: cleanedResults,
            totalResults: totalCount,
            displayedResults: displayedCount,
            families: Array.from(families),
            limitApplied: totalCount > maxResults
          })
        }
      } 
		catch (timeoutError: any) {
        console.error('❌ Query timeout:', timeoutError)
        
        return NextResponse.json({
          success: false,
          error: 'Query took too long to execute. Please try a more specific search or use filters.',
          timeout: true
        }, { status: 408 })
      }
    }

    // ========================================================================
    // STEP 4: HANDLE ANALYTICAL QUESTIONS WITH SMART AI
    // ========================================================================
    
    if (searchParams.questionType === "analytical") {
      console.log(`🤖 Analytical mode - generating Smart AI summary from ${cleanedResults.length} products`)
      
      const aiSummary = await generateSmartAISummary(query, cleanedResults, 'analytical')
      
      return NextResponse.json({
        success: true,
        questionType: "analytical",
        summary: aiSummary,
        results: cleanedResults,
        count: cleanedResults.length,
        message: `Analysis based on ${cleanedResults.length} product(s)`
      })
    }

    // ========================================================================
    // STEP 5: HANDLE COMPARISON QUESTIONS WITH SMART AI
    // ========================================================================
    
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
          ? groupedProducts 
          : cleanedResults.slice(0, Math.min(compareProducts.length || 2, cleanedResults.length))
        
        const comparisonType = detectComparisonType(productsToCompare)
        console.log(`📊 Comparison type detected: ${comparisonType}`)
        
        console.log(`📊 Generating Smart AI comparison analysis`)
        const comparisonSummary = await generateSmartComparisonAnalysis(query, productsToCompare, comparisonType)
        
        return NextResponse.json({
          success: true,
          questionType: "comparison",
          products: productsToCompare,
          compareProducts: searchParams.compareProducts || [],
          comparisonType: comparisonType,
          comparisonSummary: comparisonSummary,
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

    // ========================================================================
    // STEP 6: HANDLE SPECIFIC AI QUESTIONS WITH SMART AI
    // ========================================================================
    
    if (searchParams.questionType === "specific_ai" && cleanedResults.length > 0) {
      const product = cleanedResults[0]
      const attributeQuestion = searchParams.attributeQuestion || query
      
      console.log('🤖 Using Smart AI to extract answer from product data')
      
      try {
        const productDataString = prepareCompleteProductDataForAI([product])
        
        const answerCompletion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `You are a product information assistant. Extract the relevant answer from the product data.

RULES:
- Answer directly and concisely
- If information not found, say "This information is not available in the product data"
- Extract ALL relevant information
- Use dashes (-) for lists, NOT bullet points (•)
- Remove all HTML tags
- Convert HTML entities (e.g., &deg; to °, &reg; to ®)
- Convert field names naturally (e.g., "Cure Time" not "Cure_Time")
- Be specific and complete
- Search through ALL fields intelligently

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

    // ========================================================================
    // STEP 7: HANDLE LIST QUESTIONS WITH SMART AI SUMMARY
    // ========================================================================
    
    if (searchParams.questionType === "list" && cleanedResults.length > 0) {
      console.log(`📋 List mode - generating Smart AI summary for ${cleanedResults.length} products`)
      
      // Generate AI summary for better context
      const aiSummary = await generateSmartAISummary(query, cleanedResults, 'list')
      
      return NextResponse.json({
        success: true,
        questionType: "list",
        summary: aiSummary,
        results: cleanedResults,
        count: cleanedResults.length
      })
    }

    // ========================================================================
    // DEFAULT: RETURN CLEANED RESULTS
    // ========================================================================
    
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
