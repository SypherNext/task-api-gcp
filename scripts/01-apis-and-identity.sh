#!/usr/bin/env bash
# Capstone step 1: billing check, the six APIs, the task-runtime service account
# and its Cloud SQL Client role. No hourly charge yet.
source "$(dirname "$0")/lab.sh"

step "Billing must be enabled on $PROJECT_ID"
billing="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)')"
echo "billingEnabled: $billing"
if [[ "$billing" != "True" ]]; then
  echo "Link a billing account to the project first (Billing > Account management)." >&2
  exit 1
fi

step "Enabling Cloud Run, Cloud SQL Admin, Secret Manager, Artifact Registry, Cloud Build and IAM"
gcloud services enable run.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com iam.googleapis.com --project="$PROJECT_ID"

step "Runtime service account task-runtime"
if ! gcloud iam service-accounts describe "$RUNTIME_SA" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create task-runtime \
    --display-name='Task API runtime' --project="$PROJECT_ID"
fi
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" --role='roles/cloudsql.client' \
  --condition=None --format=none

gcloud projects get-iam-policy "$PROJECT_ID" --flatten='bindings[].members' \
  --filter="bindings.members:serviceAccount:${RUNTIME_SA}" \
  --format='table(bindings.role)'
