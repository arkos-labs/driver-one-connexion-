import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://oggxhosuvbmdmpiziezp.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  const email = 'dev@one-connexion.com';
  const password = 'DevPassword123!';

  let userId = null;

  // 1. Check if user exists
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersData?.users) {
    const existingUser = usersData.users.find(u => u.email === email);
    if (existingUser) {
      userId = existingUser.id;
      console.log('User already exists, ID:', userId);
    }
  }

  if (!userId) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'courier', full_name: 'Dev Chauffeur' }
    });

    if (authError) {
      console.error('Error creating user:', authError);
      process.exit(1);
    }
    userId = authData?.user?.id;
  }

  if (userId) {
    // 2. Create profile
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      role: 'courier'
    });

    if (profileError) {
      console.error('Error creating profile:', profileError);
      process.exit(1);
    }
    
    console.log(`User created successfully! ID: ${userId}`);
  } else {
    console.log('User already existed, skipping creation.');
  }
}

main();
