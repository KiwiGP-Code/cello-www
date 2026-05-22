#!/usr/bin/env bash
# Creates GCP Monitoring email alerts for authenticated Cello preview visits.
# Requires: gcloud auth, project cello-www, alpha monitoring commands.
set -euo pipefail

PROJECT="${GCP_PROJECT:-cello-www}"
EMAIL="${VISIT_ALERT_EMAIL:-glen@thepatricks.co.nz}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICY_FILE="${SCRIPT_DIR}/../gcp/visit-email-alert-policy.json"

echo "Project: ${PROJECT}"
echo "Alert email: ${EMAIL}"

CHANNEL_NAME="$(gcloud alpha monitoring channels list \
  --project="${PROJECT}" \
  --filter="displayName='Glen - Cello preview visits'" \
  --format='value(name)' 2>/dev/null | head -1)"

if [[ -z "${CHANNEL_NAME}" ]]; then
  CHANNEL_NAME="$(gcloud alpha monitoring channels create \
    --project="${PROJECT}" \
    --display-name="Glen - Cello preview visits" \
    --type=email \
    --channel-labels="email_address=${EMAIL}" \
    --format='value(name)')"
  echo "Created notification channel: ${CHANNEL_NAME}"
  echo "Check ${EMAIL} for a verification link from Google Cloud Monitoring."
else
  echo "Using existing notification channel: ${CHANNEL_NAME}"
fi

TMP_POLICY="$(mktemp)"
sed "s|projects/cello-www/notificationChannels/[0-9]*|${CHANNEL_NAME}|" "${POLICY_FILE}" > "${TMP_POLICY}"

EXISTING="$(gcloud alpha monitoring policies list \
  --project="${PROJECT}" \
  --filter="displayName='Cello preview — authenticated visit'" \
  --format='value(name)' 2>/dev/null | head -1)"

if [[ -n "${EXISTING}" ]]; then
  gcloud alpha monitoring policies update "${EXISTING}" \
    --project="${PROJECT}" \
    --policy-from-file="${TMP_POLICY}"
  echo "Updated alert policy: ${EXISTING}"
else
  gcloud alpha monitoring policies create \
    --project="${PROJECT}" \
    --policy-from-file="${TMP_POLICY}"
  echo "Created alert policy for authenticated visits."
fi

rm -f "${TMP_POLICY}"
echo "Done. Emails fire on successful login (max one per hour per alert rate limit)."
