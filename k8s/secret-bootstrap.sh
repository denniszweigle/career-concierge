#!/usr/bin/env bash
# Creates or updates the career-concierge-env k8s Secret from environment variables.
# Usage: source .env && ./k8s/secret-bootstrap.sh
set -euo pipefail

kubectl create secret generic career-concierge-env \
  --namespace=career-concierge \
  --from-literal=FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID}" \
  --from-literal=FIREBASE_SERVICE_ACCOUNT_KEY="${FIREBASE_SERVICE_ACCOUNT_KEY}" \
  --from-literal=JWT_SECRET="${JWT_SECRET}" \
  --from-literal=VITE_APP_ID="${VITE_APP_ID}" \
  --from-literal=BUILT_IN_FORGE_API_URL="${BUILT_IN_FORGE_API_URL}" \
  --from-literal=BUILT_IN_FORGE_API_KEY="${BUILT_IN_FORGE_API_KEY}" \
  --from-literal=GOOGLE_DRIVE_CLIENT_ID="${GOOGLE_DRIVE_CLIENT_ID}" \
  --from-literal=GOOGLE_DRIVE_CLIENT_SECRET="${GOOGLE_DRIVE_CLIENT_SECRET}" \
  --from-literal=GOOGLE_DRIVE_FOLDER_URL="${GOOGLE_DRIVE_FOLDER_URL}" \
  --from-literal=OWNER_OPEN_ID="${OWNER_OPEN_ID}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Secret career-concierge-env applied successfully."
