import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oggxhosuvbmdmpiziezp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nZ3hob3N1dmJtZG1waXppZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyOTIwMDEsImV4cCI6MjEwNDg2ODAwMX0.gBJ8vmLECq1wgO8pJUao9ParAD9h130_oMkWPkoeAq0';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testLogin() {
  const email = 'dev@one-connexion.com';
  const password = 'DevPassword123!';

  console.log('Testing login...');
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Login failed:', error);
    return;
  }
  console.log('Login success! User ID:', data.user.id);

  console.log('Fetching profile...');
  const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();
      
  if (profileError) {
    console.error('Profile fetch failed:', profileError);
  } else {
    console.log('Profile found:', profile);
  }
}

testLogin();
