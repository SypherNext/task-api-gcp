# Shared settings for every numbered script. Each script sources this file.
# Non-secret values (project, region, the deployed image digest, the secret
# version) are saved in .lab-names at the repository root so you can run the
# scripts one at a time in new terminals. Passwords are never written there.
set -euo pipefail
# Git Bash on Windows rewrites arguments that start with "/" into Windows paths.
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAMES_FILE="$ROOT/.lab-names"

if [[ ! -f "$NAMES_FILE" ]]; then
  project="${PROJECT_ID:-$(gcloud config get project 2>/dev/null || true)}"
  if [[ -z "$project" ]]; then
    echo "Set your lab project first: gcloud config set project <your-project-id>" >&2
    exit 1
  fi
  printf 'PROJECT_ID=%s\nREGION=%s\n' "$project" "${REGION:-us-central1}" > "$NAMES_FILE"
fi
# shellcheck source=/dev/null
source "$NAMES_FILE"

INSTANCE=task-db
DATABASE=tasks
APP_USER=task_app
RUNTIME_SA="task-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
REPOSITORY=task-images
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/task-api:v1"
SECRET=task-db-password
SERVICE=task-api

step() { printf '\n== %s\n' "$*"; }

require() {
  local name="$1" value="$2"
  if [[ -z "$value" ]]; then
    echo "Could not read $name. Run the earlier scripts first and check their output." >&2
    exit 1
  fi
}

# Saves or replaces one KEY=value line in .lab-names.
remember() {
  local key="$1" value="$2"
  grep -v "^${key}=" "$NAMES_FILE" > "$NAMES_FILE.tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$NAMES_FILE.tmp"
  mv "$NAMES_FILE.tmp" "$NAMES_FILE"
}

random_hex() { node -e "console.log(require('node:crypto').randomBytes($1).toString('hex'))"; }

echo "Project: $PROJECT_ID   Region: $REGION"
