import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://icureesvnphgoxyrogxn.supabase.co'
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljdXJlZXN2bnBoZ294eXJvZ3huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODgxMDksImV4cCI6MjA4NzM2NDEwOX0.-XSxNbnrQaPOBIM_RYEw57U0KzbMKqB5rOlBwNcQVQw'

export const supabase = createClient(supabaseUrl, supabaseKey)
