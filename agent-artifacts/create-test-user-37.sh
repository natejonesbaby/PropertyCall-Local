#!/bin/bash

TIMESTAMP=$(date +%s)
EMAIL="test_ui_empty_37_${TIMESTAMP}@example.com"

curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"TestPassword123!\",
    \"name\": \"UI Empty Test User\"
  }"

echo ""
echo "Created user: $EMAIL"
