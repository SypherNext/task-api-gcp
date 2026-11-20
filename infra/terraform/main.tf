terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 7.0, < 8.0"
    }
  }
}

variable "project_id" { type = string }
variable "bucket_name" { type = string }

provider "google" {
  project = var.project_id
  region  = "us-central1"
}

resource "google_storage_bucket" "lab" {
  name                        = var.bucket_name
  location                    = "US-CENTRAL1"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
}
