#!/usr/bin/env bash
# Capstone step 3: the task_app database login with ONLY task_app_role, and its
# password stored in Secret Manager. The password is generated here, sent to Cloud
# SQL and Secret Manager, and never printed or written to disk.
source "$(dirname "$0")/lab.sh"

APP_PASSWORD="$(random_hex 32)"

step "Database login $APP_USER"
if gcloud sql users describe "$APP_USER" --instance="$INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "$APP_USER exists; setting a new password."
  gcloud sql users set-password "$APP_USER" --instance="$INSTANCE" --project="$PROJECT_ID" \
    --password="$APP_PASSWORD"
else
  # Without --database-roles a built-in user would join cloudsqlsuperuser.
  if ! gcloud sql users create "$APP_USER" --instance="$INSTANCE" --project="$PROJECT_ID" \
      --database-roles=task_app_role --password="$APP_PASSWORD"; then
    echo "Creating $APP_USER failed. Did you run scripts/sql/app-role.sql in Cloud SQL Studio?" >&2
    exit 1
  fi
fi

step "Secret $SECRET (a new version holds the password)"
if gcloud secrets describe "$SECRET" --project="$PROJECT_ID" >/dev/null 2>&1; then
  printf '%s' "$APP_PASSWORD" | gcloud secrets versions add "$SECRET" \
    --project="$PROJECT_ID" --data-file=- --format=none
else
  printf '%s' "$APP_PASSWORD" | gcloud secrets create "$SECRET" \
    --project="$PROJECT_ID" --replication-policy=automatic --data-file=- --format=none
fi
unset APP_PASSWORD
# The newest version is the one just written; the deployment pins its number.
SECRET_VERSION="$(gcloud secrets versions list "$SECRET" --project="$PROJECT_ID" \
  --sort-by=~createTime --limit=1 --format='value(name)')"
SECRET_VERSION="${SECRET_VERSION##*/}"
require "secret version" "$SECRET_VERSION"
remember SECRET_VERSION "$SECRET_VERSION"
echo "Secret version $SECRET_VERSION will be pinned by the deployment."

step "Secret Accessor on this one secret for task-runtime"
gcloud secrets add-iam-policy-binding "$SECRET" --project="$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" --role='roles/secretmanager.secretAccessor' --format=none
gcloud secrets versions list "$SECRET" --project="$PROJECT_ID" --format='table(name,state,createTime)'
