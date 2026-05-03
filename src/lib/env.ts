import { z } from 'zod';

const envSchema = z.object({
    // Shopify Config
    SHOPIFY_SHOP_NAME: z.string().min(1),
    SHOPIFY_API_ACCESS_TOKEN: z.string().min(1),
    
    // Warehouse Config
    GAMMA_WAREHOUSE_LOCATION_ID: z.coerce.number().default(93998154045),
    
    // API Config
    GAMMA_API_URL: z.string().url().optional(),
    GAMMA_API_TOKEN: z.string().optional(),
    
    // FTP Config
    FTP_DIRECTORY: z.string().default('/Gamma_Product_Files/Shopify_Files/'),
    ALLOW_INSECURE_FTP: z.preprocess((val) => val === 'true', z.boolean()).default(false),
    
    // Server Environment
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // FTP Defaults (used in actions)
    FTP_HOST: z.string().optional(),
    FTP_USER: z.string().optional(),
    FTP_PASSWORD: z.string().optional(),
    NEXT_PUBLIC_FTP_HOST: z.string().optional(),
    NEXT_PUBLIC_FTP_USERNAME: z.string().optional(),
    NEXT_PUBLIC_FTP_PASSWORD: z.string().optional(),
});

// Use safeParse to provide a clear error message if validation fails
const isBuild = process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'test';
const parsed = envSchema.safeParse(process.env);

if (!parsed.success && !isBuild) {
    console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
    throw new Error('Invalid environment variables. Check your .env file.');
}

// Fallback for build phase to avoid breaking prerendering
export const env = parsed.success ? parsed.data : envSchema.parse({
    SHOPIFY_SHOP_NAME: 'build-placeholder',
    SHOPIFY_API_ACCESS_TOKEN: 'build-placeholder',
    ...process.env
});
