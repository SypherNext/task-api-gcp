#!/usr/bin/env bash
# Capstone step 7: delete the service, database, secret, image repository, IAM
# binding and service account. Type the project ID to confirm.
source "$(dirname "$0")/lab.sh"

read -rp "Type the project ID ($PROJECT_ID) to delete the Task API lab resources in it: " answer
if [[ "$answer" != "$PROJECT_ID" ]]; then echo "Nothing deleted."; exit 1; fi

step "Cloud Run service $SERVICE"
gcloud run services delete "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --quiet || true

step "Cloud SQL instance $INSTANCE (its automatic backups go with it)"
gcloud sql instances patch "$INSTANCE" --project="$PROJECT_ID" --no-deletion-protection --quiet || true
gcloud sql instances delete "$INSTANCE" --project="$PROJECT_ID" --quiet || true

step "Secret, image repository, IAM binding and service account"
gcloud secrets delete "$SECRET" --project="$PROJECT_ID" --quiet || true
gcloud artifacts repositories delete "$REPOSITORY" --location="$REGION" --project="$PROJECT_ID" --quiet || true
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" --role='roles/cloudsql.client' --condition=None --format=none || true
gcloud iam service-accounts delete "$RUNTIME_SA" --project="$PROJECT_ID" --quiet || true

step "What is left (each list should be empty or show only resources you meant to keep)"
gcloud run services list --project="$PROJECT_ID" --region="$REGION"
gcloud sql instances list --project="$PROJECT_ID"
gcloud artifacts repositories list --location="$REGION" --project="$PROJECT_ID"
gcloud secrets list --project="$PROJECT_ID"
echo "Backups kept after an instance is deleted (charged until you delete them):"
gcloud sql backups list --instance=- --project="$PROJECT_ID" 2>/dev/null || true
echo "Cloud Build source uploads stay in the gs://${PROJECT_ID}_cloudbuild bucket; delete it if you no longer need it."

rm -f "$NAMES_FILE"
echo "Removed .lab-names. Check Billing > Reports over the next day or two."
