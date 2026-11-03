import { z } from 'zod'

// Validation schemas for store operations
export const createCheckoutSessionSchema = z.object({
  productId: z.string().uuid('Invalid product ID format'),
  sizeId: z.string().uuid('Invalid size ID format'),
  shippingMethodId: z.string().uuid('Invalid shipping method ID format'),
})

export const updateOrderStatusSchema = z.object({
  stripeSessionId: z.string().min(1, 'Order reference is required'),
  email: z.string().email('Invalid email format'),
  status: z.literal('processing'),
  shipping: z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
    address: z.object({
      line1: z.string().min(1, 'Address line 1 is required').max(200, 'Address line 1 too long'),
      line2: z.string().max(200, 'Address line 2 too long').optional(),
      city: z.string().min(1, 'City is required').max(100, 'City too long'),
      state: z.string().min(1, 'State is required').max(100, 'State too long'),
      postal_code: z.string().min(1, 'Postal code is required').max(20, 'Postal code too long'),
      country: z.string().min(2, 'Country is required').max(2, 'Country must be 2 characters'),
    }),
  }).optional(),
})

// The Costs form and the updateTaxRates action both work in whole percentages
// (0-100): the action stores percentage * 10000 and the UI divides it back.
// These caps previously used fractions (max 1 / max 0.1), so every realistic
// value was rejected and the tax settings could never be saved.
export const updateTaxRatesSchema = z.object({
  taxRate: z.number().min(0, 'Tax rate must be positive').max(100, 'Tax rate cannot exceed 100%'),
  stripeRate: z.number().min(0, 'Payment gateway rate must be positive').max(100, 'Payment gateway rate cannot exceed 100%'),
  profitPercentage: z.number().min(0, 'Profit percentage must be positive').max(100, 'Profit percentage cannot exceed 100%'),
})

export const emailSchema = z.object({
  email: z.string().email('Invalid email format'),
  orderId: z.string().min(1, 'Order ID is required'),
  shippingDetails: z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
    address: z.object({
      line1: z.string().min(1, 'Address line 1 is required').max(200, 'Address line 1 too long'),
      line2: z.string().max(200, 'Address line 2 too long').optional(),
      city: z.string().min(1, 'City is required').max(100, 'City too long'),
      state: z.string().min(1, 'State is required').max(100, 'State too long'),
      postal_code: z.string().min(1, 'Postal code is required').max(20, 'Postal code too long'),
      country: z.string().min(2, 'Country is required').max(2, 'Country must be 2 characters'),
    }),
  }).optional(),
})

export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>
export type UpdateTaxRatesInput = z.infer<typeof updateTaxRatesSchema>
export type EmailInput = z.infer<typeof emailSchema>