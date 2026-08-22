#!/usr/bin/env bash
# One-time repository hardening after publishing to GitHub.
#
# Usage:   bash scripts/setup-repo-hardening.sh OWNER/REPO
# Needs:   gh CLI authenticated as someone with admin on that repository.
#
# Run AFTER the initial push of main (branch protection requires PRs, which
# would otherwise block the very first push).
#
# Configures:
#   1. Branch protection on main (PRs required, CI checks required,
#      no force pushes, linear history, admins included).
#   2. Secret scanning + push protection + Dependabot security updates.
#   3. Private vulnerability reporting.
#   4. Squash-only merges with automatic head-branch deletion.

set -euo pipefail

REPO="${1:?usage: setup-repo-hardening.sh OWNER/REPO}"

echo "==> Branch protection on main"
gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Verify", "Privacy egress"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true
}
JSON

echo "==> Secret scanning, push protection, Dependabot security updates"
gh api -X PATCH "repos/$REPO" --input - <<'JSON' || echo "WARN: some settings may be unavailable on your plan/repo visibility; enable them manually in Settings > Code security."
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" },
    "dependabot_security_updates": { "status": "enabled" }
  }
}
JSON

echo "==> Private vulnerability reporting"
gh api -X PUT "repos/$REPO/private-vulnerability-reporting" >/dev/null && echo "enabled"

echo "==> Squash-only merges, delete branches on merge"
gh api -X PATCH "repos/$REPO" \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true >/dev/null && echo "configured"

echo
echo "Done. Verify at:"
echo "  https://github.com/$REPO/settings/branches"
echo "  https://github.com/$REPO/settings/security_analysis"
