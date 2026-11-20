#!/usr/bin/env bash
# Capstone step 5: the Cloud Run service. Authenticated invocation only, the
# task-runtime identity, the Cloud SQL socket, the pinned image digest and the
# pinned secret version. Scales to zero; at most 2 instances.
source "$(dirname "$0")/lab.sh"
require "DEPLOY_IMAGE (run 04-image.sh)" "${DEPLOY_IMAGE:-}"
require "SECRET_VERSION (run 03-app-login-and-secret.sh)" "${SECRET_VERSION:-}"

CONNECTION_NAME="$(gcloud sql instances describe "$INSTANCE" --project="$PROJECT_ID" --format='value(connectionName)')"
require "Cloud SQL connection name" "$CONNECTION_NAME"

step "Deploying $SERVICE"
gcloud run deploy "$SERVICE" --project="$PROJECT_ID" --region="$REGION" \
  --image="$DEPLOY_IMAGE" --service-account="$RUNTIME_SA" \
  --execution-environment=gen2 --port=8080 \
  --cpu=1 --memory=512Mi --timeout=60 --concurrency=20 --min=0 --max=2 \
  --invoker-iam-check --no-allow-unauthenticated \
  --add-cloudsql-instances="$CONNECTION_NAME" \
  --set-env-vars="DB_HOST=/cloudsql/${CONNECTION_NAME},DB_USER=${APP_USER},DB_NAME=${DATABASE}" \
  --set-secrets="DB_PASSWORD=${SECRET}:${SECRET_VERSION}"

gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" \
  --format='yaml(status.url,status.latestReadyRevisionName,spec.template.spec.serviceAccountName)'
