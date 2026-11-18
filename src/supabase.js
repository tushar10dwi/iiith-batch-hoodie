import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const sb = url && key ? createClient(url, key) : null // null = demo mode
export const DOMAINS = ['iiit.ac.in', 'students.iiit.ac.in', 'research.iiit.ac.in']
