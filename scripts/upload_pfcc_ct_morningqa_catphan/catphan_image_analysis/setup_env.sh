#!/bin/bash
# Script to generate .env file with secure random passwords

echo "Generating secure random passwords for MongoDB..."

MONGO_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")

cat > .env << ENVFILE
# MongoDB Configuration
# Generated on $(date)
MONGO_INITDB_ROOT_USERNAME=root
MONGO_INITDB_ROOT_PASSWORD=${MONGO_PASSWORD}
MONGO_EXPRESS_ADMIN_PASSWORD=${MONGO_PASSWORD}

# Redis Configuration (if password authentication is needed)
# REDIS_PASSWORD=CHANGE_ME_GENERATE_RANDOM_PASSWORD
ENVFILE

echo "✓ .env file created with secure random passwords"
echo "⚠️  Keep this file secure and do not commit it to version control!"
