import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('Atenção: Variáveis SUPABASE_URL e SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY não configuradas.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
