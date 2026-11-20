#!/usr/bin/env bash
# Capstone step 2: Cloud SQL for PostgreSQL 18, Enterprise edition, 1 vCPU and
# 3.75 GB, one zone, public IP with NO authorised networks (Cloud Run reaches it
# through the Cloud SQL connector). Billing starts here: about 0.068 USD an hour.
# Creating the instance takes several minutes.
source "$(dirname "$0")/lab.sh"

step "Instance $INSTANCE"
if gcloud sql instances describe "$INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "$INSTANCE already exists; reusing it."
else
  gcloud sql instances create "$INSTANCE" --project="$PROJECT_ID" \
    --database-version=POSTGRES_18 --edition=ENTERPRISE --tier=db-custom-1-3840 \
    --region="$REGION" --availability-type=ZONAL --storage-size=10 --assign-ip \
    --backup-start-time=03:00 --enable-point-in-time-recovery \
    --server-ca-mode=GOOGLE_MANAGED_INTERNAL_CA --no-deletion-protection
fi

step "Database $DATABASE"
if ! gcloud sql databases describe "$DATABASE" --instance="$INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud sql databases create "$DATABASE" --instance="$INSTANCE" --project="$PROJECT_ID"
fi

step "Choose the postgres administrator password (you type it; keep it in your password manager)"
gcloud sql users set-password postgres --instance="$INSTANCE" --project="$PROJECT_ID" --prompt-for-password

gcloud sql instances describe "$INSTANCE" --project="$PROJECT_ID" \
  --format='yaml(databaseVersion,state,connectionName,settings.tier,settings.ipConfiguration.authorizedNetworks)'

cat <<'EOF'

Next, by hand, in the console: SQL > task-db > Cloud SQL Studio.
Sign in to database "tasks" as user "postgres" with the password you just chose,
then run, in this order:
  1. app/schema.sql            (creates the tasks table)
  2. scripts/sql/app-role.sql  (creates task_app_role with CRUD on tasks only)
Then run ./scripts/03-app-login-and-secret.sh
EOF
