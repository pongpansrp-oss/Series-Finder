import { createClient } from '@supabase/supabase-js'

// ดึงค่าจาก .env หรือ localStorage
const getSavedConfig = () => {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || ''
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

  const localUrl = localStorage.getItem('scary_supabase_url') || ''
  const localKey = localStorage.getItem('scary_supabase_key') || ''

  return {
    url: localUrl || envUrl,
    key: localKey || envKey
  }
}

const config = getSavedConfig()

// สร้าง client ถ้ามี config ครบ
export const supabase = (config.url && config.key)
  ? createClient(config.url, config.key)
  : null

export const initSupabaseClient = (url, key) => {
  if (!url || !key) return null
  localStorage.setItem('scary_supabase_url', url)
  localStorage.setItem('scary_supabase_key', key)
  return createClient(url, key)
}

export const clearSupabaseConfig = () => {
  localStorage.removeItem('scary_supabase_url')
  localStorage.removeItem('scary_supabase_key')
}

