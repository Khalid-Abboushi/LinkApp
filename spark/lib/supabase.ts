// lib/supabase.ts
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
if (!supabaseUrl) throw new Error('EXPO_PUBLIC_SUPABASE_URL is missing');
if (!supabaseAnonKey) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing');

const isSSR = typeof window === 'undefined';
let storage: any = undefined;

if (!isSSR) {
  // Runtime: web uses localStorage; native uses AsyncStorage.
  if (typeof document !== 'undefined') {
    storage = window.localStorage;
  } else {
    // Lazy-require only on native so SSR doesn’t touch it
    storage = require('@react-native-async-storage/async-storage').default;
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,                         // undefined during SSR
    persistSession: !isSSR,          // avoid touching storage on SSR
    autoRefreshToken: !isSSR,        // ditto
    detectSessionInUrl: false,       // RN/web SPA safe
  },
});
