#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

// Configuration Supabase
const SUPABASE_URL = 'https://oggxhosuvbmdmpiziezp.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Erreur: SUPABASE_SERVICE_ROLE_KEY non trouvée dans les variables d\'environnement');
  console.error('Configurez SUPABASE_SERVICE_ROLE_KEY dans votre .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TEST_DRIVER = {
  email: 'chauffeur@oneconnexion.fr',
  password: 'Test123456!',
  full_name: 'Ahmed Chauffeur',
  phone: '+33612345678',
  company: 'One Connexion',
};

async function createTestDriver() {
  try {
    console.log('🚀 Création d\'un chauffeur de test...\n');

    // 1. Créer l'utilisateur Auth
    console.log('1️⃣ Création de l\'utilisateur Supabase Auth...');
    const { data: user, error: authError } = await supabase.auth.admin.createUser({
      email: TEST_DRIVER.email,
      password: TEST_DRIVER.password,
      email_confirm: true,
    });

    if (authError) {
      console.error('❌ Erreur lors de la création de l\'utilisateur:', authError.message);
      process.exit(1);
    }

    console.log('✅ Utilisateur créé avec l\'ID:', user.user.id);

    // 2. Créer le profil chauffeur
    console.log('\n2️⃣ Création du profil chauffeur...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert([
        {
          id: user.user.id,
          full_name: TEST_DRIVER.full_name,
          phone: TEST_DRIVER.phone,
          company: TEST_DRIVER.company,
          role: 'courier',
        },
      ])
      .select();

    if (profileError) {
      console.error('❌ Erreur lors de la création du profil:', profileError.message);
      process.exit(1);
    }

    console.log('✅ Profil créé!');

    // 3. Afficher les résultats
    console.log('\n' + '='.repeat(60));
    console.log('✨ CHAUFFEUR DE TEST CRÉÉ AVEC SUCCÈS!');
    console.log('='.repeat(60));
    console.log('\n📝 Identifiants de connexion:');
    console.log(`   Email: ${TEST_DRIVER.email}`);
    console.log(`   Mot de passe: ${TEST_DRIVER.password}`);
    console.log(`\n👤 Profil:`);
    console.log(`   Nom: ${TEST_DRIVER.full_name}`);
    console.log(`   Téléphone: ${TEST_DRIVER.phone}`);
    console.log(`   Entreprise: ${TEST_DRIVER.company}`);
    console.log(`   Rôle: courier (chauffeur)`);
    console.log('\n🔐 Sauvegardez ces identifiants en lieu sûr!');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Erreur inattendue:', error.message);
    process.exit(1);
  }
}

createTestDriver();
