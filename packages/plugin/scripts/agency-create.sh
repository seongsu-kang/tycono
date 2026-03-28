#!/bin/bash

# Tycono Plugin — Agency Create
# Creates a new custom agency

set -euo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=en_US.UTF-8

# Parse arguments
NAME=""
ROLES="cto,engineer"

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      echo "Usage: agency-create <name> [--roles cto,engineer,qa]"
      echo ""
      echo "  Create a new custom agency."
      echo ""
      echo "  Arguments:"
      echo "    <name>              Agency ID (lowercase, hyphens ok)"
      echo "    --roles <list>      Comma-separated role IDs (default: cto,engineer)"
      echo ""
      echo "  Examples:"
      echo "    agency-create my-team"
      echo "    agency-create web-app --roles cto,engineer,qa,designer"
      exit 0
      ;;
    --roles)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --roles requires a comma-separated list" >&2
        exit 1
      fi
      ROLES="$2"
      shift 2
      ;;
    -*)
      echo "❌ Unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ -z "$NAME" ]]; then
        NAME="$1"
      fi
      shift
      ;;
  esac
done

if [[ -z "$NAME" ]]; then
  echo "❌ Error: Agency name is required." >&2
  echo "" >&2
  echo "  Usage: agency-create <name> [--roles cto,engineer,qa]" >&2
  exit 1
fi

# Validate name (lowercase, hyphens, numbers only)
if [[ ! "$NAME" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "❌ Error: Agency name must be lowercase, start with a letter, and contain only letters, numbers, and hyphens." >&2
  exit 1
fi

AGENCIES_DIR="knowledge/agencies"
AGENCY_DIR="${AGENCIES_DIR}/${NAME}"

if [[ -d "$AGENCY_DIR" ]]; then
  echo "❌ Error: Agency '${NAME}' already exists at ${AGENCY_DIR}/" >&2
  exit 1
fi

# Create directory structure
mkdir -p "${AGENCY_DIR}"

# Build roles YAML list
IFS=',' read -ra ROLE_ARRAY <<< "$ROLES"
ROLES_YAML=""
for role in "${ROLE_ARRAY[@]}"; do
  role=$(echo "$role" | tr -d ' ')
  ROLES_YAML="${ROLES_YAML}  - ${role}
"
done

# Generate agency.yaml
cat > "${AGENCY_DIR}/agency.yaml" <<AGENCY_YAML
# ${NAME} — Custom Tycono Agency

spec: agency/v1
id: ${NAME}
name: "${NAME}"
tagline: "Custom agency"
version: "1.0.0"

description: |
  Custom agency created by user.

author:
  id: custom
  name: "Custom"
  verified: false

category: custom
industry: general
stage: idea
use_case:
  - custom

roles:
${ROLES_YAML}
recommended_knowledge: []

pricing:
  type: one-time
  price: 0

tags: [custom]
languages: [en]

stats:
  installs: 0
  rating: 0
  reviews: 0
  waves_used: 0
AGENCY_YAML

echo "✅ Agency '${NAME}' created!"
echo ""
echo "  📁 Location: ${AGENCY_DIR}/"
echo "  📄 Config:   ${AGENCY_DIR}/agency.yaml"
echo "  👥 Roles:    ${ROLES}"
echo ""
echo "  Next steps:"
echo "    1. Edit ${AGENCY_DIR}/agency.yaml to customize"
echo "    2. Use: /tycono --agency ${NAME} <task>"
echo ""
echo "🌐 Register your agency: https://tycono.ai/agencies/new"
