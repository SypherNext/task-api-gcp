# Task API on Google Cloud

This repository is the companion code for the Sypher course "GCP Hands-On: Deploy a Secure Cloud App". It holds the Task API the course deploys (Node.js and PostgreSQL, with 15 unit tests, a PostgreSQL integration test and a Dockerfile), seven numbered scripts that build the capstone on Google Cloud and tear it down, the Terraform example, and the small examples from the serverless and cost lessons.

The capstone runs the API on Cloud Run with authenticated invocation only, under its own service account, and stores tasks in Cloud SQL for PostgreSQL through the Cloud SQL connector. The database password lives in Secret Manager and is pinned by version.

**Deploying this creates billable Google Cloud resources.** At us-central1 list prices (November 2026) the capstone costs about 52 USD a month if you leave it running, or about 1.70 USD a day. Nearly all of it is the Cloud SQL instance, which charges every hour whether or not anyone calls the API; Cloud Run stays inside its free tier at lab traffic. Build it, check it and tear it down in one sitting. The tear-down is step 7 in [Deploy the capstone](#deploy-the-capstone).

The scripts were checked against the current gcloud reference and for Bash syntax, but they were not run against a Google Cloud project when the course was written. The app, its tests, the PostgreSQL 18 integration test, the container image and the Functions example were run locally. Read each script's output and stop at the first error.

## Set up your computer

You need Git, Node.js 24, Docker (for the local database test and image build) and the Google Cloud CLI, plus a Bash shell. **Cloud Shell** in the Google Cloud console already has `gcloud`, Node.js, Git and Docker, and is signed in as you; it is the easiest place to run the cloud scripts on any operating system.

On Windows, run the scripts in Cloud Shell, WSL (Ubuntu) or Git Bash. `scripts/lab.sh` sets `MSYS_NO_PATHCONV=1` because Git Bash otherwise rewrites arguments that start with `/` into Windows paths. Do not paste the Bash commands into PowerShell.

| Tool | Windows | macOS | Ubuntu or Debian |
| --- | --- | --- | --- |
| Git | `winget install --id Git.Git -e` | `brew install git` | `sudo apt install -y git` |
| Node.js 24 | `winget install Schniz.fnm`, then `fnm install 24` | `brew install fnm`, then `fnm install 24` | install fnm, then `fnm install 24` |
| Docker | `winget install Docker.DockerDesktop` | `brew install --cask docker` | `curl -fsSL https://get.docker.com \| sh` |
| Google Cloud CLI | `winget install --id Google.CloudSDK -e` | `brew install --cask gcloud-cli` | follow the Google Cloud CLI install page, https://docs.cloud.google.com/sdk/docs/install |

Open a new terminal and check each one: `git --version`, `node --version` (must start with `v24.`), `docker version` (needs a `Server:` section) and `gcloud version`.

### Your Google Cloud project

Set up the project as the course's Setup lesson describes before you deploy anything:

1. Create a dedicated project for the lab and link a billing account to it.
2. In Billing, create an alerts-only budget for that project. It only notifies you; it never stops resources.
3. Make sure your account can enable APIs, create resources and grant IAM roles in the project (a personal project's Owner can).

Then sign in and select the project:

```bash
gcloud auth login
gcloud config set project <your-project-id>
gcloud config get project
```

### Get the code

```bash
git clone <task-api-gcp repository URL> task-api-gcp
cd task-api-gcp
```

## Project layout

| Path | What it is |
| --- | --- |
| `app/app.mjs` | HTTP routes, input rules, health endpoints and request logging |
| `app/server.mjs` | Chooses memory or PostgreSQL, starts the server, handles `SIGTERM` |
| `app/postgres.mjs` | The PostgreSQL store; accepts only the Cloud SQL socket or a local database |
| `app/schema.sql` | The `tasks` table |
| `app/Dockerfile`, `.dockerignore`, `.gcloudignore` | The image, and what stays out of the build upload |
| `app/test/app.test.mjs`, `app/test-postgres.mjs` | 15 unit tests, and the PostgreSQL 18 integration test |
| `scripts/lab.sh`, `scripts/01-...` to `07-...` | Shared settings and the capstone steps |
| `scripts/sql/app-role.sql` | The narrow database role you run in Cloud SQL Studio |
| `infra/terraform/main.tf` | The infrastructure-as-code lesson's private bucket |
| `examples/functions/` | The serverless lesson's `taskHealth` function and its check |
| `examples/cost/lab-cost.mjs` | The costs lesson's capstone estimate |
| `.github/workflows/ci.yml` | Runs every local check on each pull request |

## Run the app locally

From the `app` folder:

```bash
cd app
npm ci
npm test
```

All 15 tests pass and none of them contact Google Cloud. Then start the memory version, which listens on 127.0.0.1 port 18750 and forgets its tasks when it stops:

```bash
npm start
```

In a second terminal:

```bash
curl -s http://127.0.0.1:18750/health
curl -s -X POST http://127.0.0.1:18750/tasks -H 'Content-Type: application/json' -d '{"title":"Learn GCP"}'
curl -s http://127.0.0.1:18750/tasks
```

The first line prints `{"status":"alive"}`, the second a task with a generated UUID and `"done":false`, the third a list containing it.

The health endpoints are `/health` and `/ready`, not `/healthz` and `/readyz`: Cloud Run reserves some URL paths that end in `z`, so a request to `/healthz` might never reach the container.

With Docker running, `npm run test:postgres` starts a throwaway PostgreSQL 18 container on 127.0.0.1 port 18751, checks that a task survives an API restart and that the narrow role cannot drop the table, then removes the container.

## Deploy the capstone

Run every script from the repository root, in order. The first one records your project and region in `.lab-names` (ignored by Git); later scripts add the image digest and the secret version there. Passwords never go into that file.

| Step | Script | What it does | What to look for |
| --- | --- | --- | --- |
| 1 | `./scripts/01-apis-and-identity.sh` | Checks billing, enables six APIs, creates `task-runtime` and grants it Cloud SQL Client | `billingEnabled: True`; the role table lists `roles/cloudsql.client` |
| 2 | `./scripts/02-database.sh` | Cloud SQL PostgreSQL 18 instance `task-db` and database `tasks`; you type the `postgres` password. **Billing starts.** | `state: RUNNABLE` and no `authorizedNetworks` |
| (by hand) | Cloud SQL Studio | Sign in to `tasks` as `postgres`, run `app/schema.sql`, then `scripts/sql/app-role.sql` | Both run without errors |
| 3 | `./scripts/03-app-login-and-secret.sh` | Creates `task_app` with only `task_app_role`, stores its generated password in Secret Manager, grants `task-runtime` access to that one secret | One enabled secret version, and the number it will pin |
| 4 | `./scripts/04-image.sh` | Artifact Registry repo, Cloud Build of `app/`, image digest recorded | A `DEPLOY_IMAGE=...@sha256:...` line |
| 5 | `./scripts/05-deploy.sh` | Cloud Run service with authenticated invocation, the socket, pinned digest and secret version | A service URL and `serviceAccountName: task-runtime@...` |
| 6 | `./scripts/06-verify.sh` | Grants you Invoker, then checks anonymous refusal, health, readiness, a blank title, create, complete, a new revision and delete | Every line starts with `PASS` |
| 7 | `./scripts/07-teardown.sh` | Deletes everything after you type the project ID, then lists what is left | Empty lists |

Before you deploy, it is worth confirming the database login really is narrow. In Cloud SQL Studio, as `postgres`:

```sql
SELECT pg_has_role('task_app', 'cloudsqlsuperuser', 'member') AS admin_member,
       has_table_privilege('task_app', 'public.tasks', 'INSERT') AS can_insert;
```

`admin_member` must be `false` and `can_insert` `true`.

### When something fails

| Symptom | Check first |
| --- | --- |
| Step 3 fails creating `task_app` | You have not run `scripts/sql/app-role.sql` in Cloud SQL Studio yet |
| Step 4 fails with a permission error | The build service account Cloud Build uses in your project needs permission to write to Artifact Registry and read the uploaded source |
| Step 5 fails and the revision never becomes ready | The runtime's Secret Accessor binding, the secret version number, and the image digest |
| `/ready` returns 503 | The `--add-cloudsql-instances` attachment, the Cloud SQL Client role, the secret value, the `task_app` login and its grants |
| An anonymous request succeeds | The service has a public binding; remove `allUsers` and keep the invoker IAM check on |

## Terraform example

The lesson's Terraform example manages one private bucket, separate from the capstone:

```bash
cd infra/terraform
export TF_VAR_project_id="$(gcloud config get project)"
export TF_VAR_bucket_name="${TF_VAR_project_id}-task-infra"
gcloud auth application-default login
terraform init
terraform plan -out=lab.plan
terraform apply lab.plan
terraform destroy
```

The configuration was written against the Google provider 7.x documentation; `terraform init`, `plan` and `apply` were not run when the course was written.

## Before you push to GitHub

The repository is initialised (`git init -b main`) and its files are staged, but nothing is committed. Choose a licence before you make it public.

```bash
git status --short
git commit -m "Initial commit"
git remote add origin <your GitHub repository URL>
git push -u origin main
```

## License

Copyright (C) 2026 SypherNext

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). You may
use, study and change it. If you share a modified version, or run one as a website or service
that other people use, you must make your full modified source code available under the same
license. See [LICENSE](LICENSE) for the full terms.
