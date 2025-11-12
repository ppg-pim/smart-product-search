import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // Fetch all products to extract unique filter values
    const { data: products, error } = await supabase
      .from('products')
      .select('family, product_type, specification')
      .limit(10000)

    if (error) {
      throw new Error(`Database error: ${error.message}`)
    }

    // Extract unique values for each filter
    const families = new Set<string>()
    const productTypes = new Set<string>()
    const specifications = new Set<string>()

    products?.forEach((product: any) => {
      if (product.family && product.family.trim()) {
        families.add(product.family.trim())
      }
      if (product.product_type && product.product_type.trim()) {
        productTypes.add(product.product_type.trim())
      }
      if (product.specification && product.specification.trim()) {
        specifications.add(product.specification.trim())
      }
    })

    return NextResponse.json({
      success: true,
      families: Array.from(families).sort(),
      productTypes: Array.from(productTypes).sort(),
      specifications: Array.from(specifications).sort()
    })

  } catch (error: any) {
    console.error('❌ Filter options error:', error)
    
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to load filter options',
        families: [],
        productTypes: [],
        specifications: []
      },
      { status: 500 }
    )
  }
}