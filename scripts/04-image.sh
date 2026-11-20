#!/usr/bin/env bash
# Capstone step 4: Artifact Registry repository, a Cloud Build of ./app and the
# image digest the deployment pins. The first 0.5 GB of Artifact Registry storage
# is free; Cloud Build has a monthly free allowance of build minutes.
source "$(dirname "$0")/lab.sh"

step "Repository $REPOSITORY"
if ! gcloud artifacts repositories describe "$REPOSITORY" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPOSITORY" --repository-format=docker \
    --location="$REGION" --description='Task API lab images' --project="$PROJECT_ID"
fi

step "Building $IMAGE from ./app with Cloud Build"
gcloud builds submit "$ROOT/app" --tag="$IMAGE" --project="$PROJECT_ID"

step "Pinning the digest"
DIGEST="$(gcloud artifacts docker images describe "$IMAGE" --project="$PROJECT_ID" \
  --format='value(image_summary.digest)')"
require "image digest" "$DIGEST"
DEPLOY_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/task-api@${DIGEST}"
remember DEPLOY_IMAGE "$DEPLOY_IMAGE"
echo "DEPLOY_IMAGE=$DEPLOY_IMAGE"
