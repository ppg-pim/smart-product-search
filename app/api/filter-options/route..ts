import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // First, get a sample product to see what columns are available
    const { data: sampleData, error: sampleError } = await supabase
      .from('products')
      .select('*')
      .limit(1)

    if (sampleError) {
      throw new Error(`Database error: ${sampleError.message}`)
    }

    const availableColumns = sampleData && sampleData.length > 0 
      ? Object.keys(sampleData[0]) 
      : []

    console.log('📊 Available columns:', availableColumns)

    // Fetch all products
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .limit(10000)

    if (error) {
      throw new Error(`Database error: ${error.message}`)
    }

    console.log(`📦 Fetched ${products?.length || 0} products`)

    // Extract unique values for filters
    const families = new Set<string>()
    const productTypes = new Set<string>()
    const specifications = new Set<string>()

    products?.forEach((product: any) => {
      // Try multiple possible column names for Family
      const familyValue = product.family || product.Family || product.product_family || product.productFamily
      if (familyValue && String(familyValue).trim()) {
        families.add(String(familyValue).trim())
      }

      // Try multiple possible column names for Product Type
      const typeValue = product.product_type || product.productType || product.type || product.Type || product.category || product.Category
      if (typeValue && String(typeValue).trim()) {
        productTypes.add(String(typeValue).trim())
      }

      // Try multiple possible column names for Specification
      const specValue = product.specification || product.Specification || product.spec || product.Spec
      if (specValue && String(specValue).trim()) {
        specifications.add(String(specValue).trim())
      }

      // Also check in all_attributes if it exists
      if (product.all_attributes) {
        try {
          let attributes: any = {}
          
          if (typeof product.all_attributes === 'string') {
            attributes = JSON.parse(product.all_attributes)
          } else if (typeof product.all_attributes === 'object') {
            attributes = product.all_attributes
          }

          // Check for family in attributes
          const attrFamily = attributes.family || attributes.Family || attributes.product_family || attributes.productFamily
          if (attrFamily && String(attrFamily).trim()) {
            families.add(String(attrFamily).trim())
          }

          // Check for type in attributes
          const attrType = attributes.product_type || attributes.productType || attributes.type || attributes.Type || attributes.category || attributes.Category
          if (attrType && String(attrType).trim()) {
            productTypes.add(String(attrType).trim())
          }

          // Check for specification in attributes
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

    console.log(`✅ Found ${familiesArray.length} families, ${productTypesArray.length} product types, ${specificationsArray.length} specifications`)
    console.log('📋 Families:', familiesArray.slice(0, 5))
    console.log('📋 Product Types:', productTypesArray.slice(0, 5))
    console.log('📋 Specifications:', specificationsArray.slice(0, 5))

    return NextResponse.json({
      success: true,
      families: familiesArray,
      productTypes: productTypesArray,
      specifications: specificationsArray,
      availableColumns: availableColumns,
      totalProducts: products?.length || 0
    })

  } catch (error: any) {
    console.error('❌ Filter options error:', error)
    
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to load filter options',
        families: [],
        productTypes: [],
        specifications: [],
        availableColumns: [],
        totalProducts: 0
      },
      { status: 500 }
    )
  }
}