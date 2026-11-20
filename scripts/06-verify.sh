#!/usr/bin/env bash
# Capstone step 6: grant yourself Cloud Run Invoker, then check that anonymous
# callers are refused and an authenticated caller gets working, persistent CRUD.
# Your identity token is read into memory for the requests; it is never printed.
source "$(dirname "$0")/lab.sh"

USER_EMAIL="$(gcloud config get account)"
require "signed-in account" "$USER_EMAIL"
SERVICE_URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
require "service URL" "$SERVICE_URL"

step "Cloud Run Invoker for $USER_EMAIL only"
gcloud run services add-iam-policy-binding "$SERVICE" --project="$PROJECT_ID" --region="$REGION" \
  --member="user:${USER_EMAIL}" --role='roles/run.invoker' --format=none
policy="$(gcloud run services get-iam-policy "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format=json)"
if grep -q -E 'allUsers|allAuthenticatedUsers' <<< "$policy"; then
  echo "The service is public. Remove the allUsers/allAuthenticatedUsers binding before continuing." >&2
  exit 1
fi

TOKEN="$(gcloud auth print-identity-token)"
auth=(-H "Authorization: Bearer $TOKEN")
json=(-H 'Content-Type: application/json')
status() { curl -sS -o /dev/null -w '%{http_code}' "$@"; }
FAILED=0
expect() {
  if [[ "$2" == "$1" ]]; then echo "PASS $3 ($2)"; else echo "FAIL $3: expected $1, got $2"; FAILED=1; fi
}

step "Requests to $SERVICE_URL"
anon="$(status "$SERVICE_URL/health")"
if [[ "$anon" == "401" || "$anon" == "403" ]]; then echo "PASS anonymous request refused ($anon)"; else echo "FAIL anonymous request: got $anon"; FAILED=1; fi
expect 200 "$(status "${auth[@]}" "$SERVICE_URL/health")" "health"
expect 200 "$(status "${auth[@]}" "$SERVICE_URL/ready")" "ready (database reachable)"
expect 400 "$(status "${auth[@]}" "${json[@]}" -X POST "$SERVICE_URL/tasks" --data '{"title":"   "}')" "blank title"

created="$(curl -sS "${auth[@]}" "${json[@]}" -X POST "$SERVICE_URL/tasks" --data '{"title":"Verify the GCP capstone"}')"
echo "created: $created"
TASK_ID="$(node -e "console.log(JSON.parse(process.argv[1]).id ?? '')" "$created")"
require "created task ID" "$TASK_ID"
expect 200 "$(status "${auth[@]}" "${json[@]}" -X PATCH "$SERVICE_URL/tasks/$TASK_ID" --data '{"done":true}')" "complete task"

step "Deploying a new revision (same image, one extra variable)"
gcloud run services update "$SERVICE" --project="$PROJECT_ID" --region="$REGION" \
  --update-env-vars="REVISION_CHECK=$(date +%s)" --format=none
found="$(curl -sS "${auth[@]}" "$SERVICE_URL/tasks" | node -e "
  let s = ''; process.stdin.on('data', d => s += d).on('end', () => {
    const task = JSON.parse(s).find(t => t.id === process.argv[1]);
    console.log(task && task.done ? 'yes' : 'no');
  });" "$TASK_ID")"
expect yes "$found" "task survives the new revision, still done"
expect 200 "$(status "${auth[@]}" -X DELETE "$SERVICE_URL/tasks/$TASK_ID")" "delete task"
expect 404 "$(status "${auth[@]}" -X DELETE "$SERVICE_URL/tasks/$TASK_ID")" "delete again"

unset TOKEN
if [[ "$FAILED" != 0 ]]; then echo "Some checks failed; see above." >&2; exit 1; fi
echo "All acceptance checks passed."
