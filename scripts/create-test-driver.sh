#!/bin/bash

# Script pour créer un chauffeur de test dans Supabase
# Usage: ./scripts/create-test-driver.sh

PROJECT_REF="oggxhosuvbmdmpiziezp"

# Credentials de test
TEST_EMAIL="chauffeur@oneconnexion.fr"
TEST_PASSWORD="Test123456!"
TEST_NAME="Ahmed Chauffeur"
TEST_PHONE="+33612345678"
TEST_COMPANY="One Connexion"

echo "🚀 Création d'un chauffeur de test..."
echo "Email: $TEST_EMAIL"
echo "Mot de passe: $TEST_PASSWORD"
echo ""

# Étape 1: Créer l'utilisateur via Supabase CLI
echo "1️⃣ Création de l'utilisateur Supabase Auth..."
supabase auth admin create-user \
  --email "$TEST_EMAIL" \
  --password "$TEST_PASSWORD" \
  --project-ref "$PROJECT_REF"

echo ""
echo "✅ Utilisateur créé!"
echo "Vous pouvez maintenant vous connecter avec:"
echo "  Email: $TEST_EMAIL"
echo "  Mot de passe: $TEST_PASSWORD"
echo ""
echo "📝 Sauvegardez ces identifiants dans un endroit sûr!"
