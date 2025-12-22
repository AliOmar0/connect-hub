#!/bin/bash

# Script to set up branch protection rules for main branch
# Requires GitHub CLI (gh) to be installed and authenticated
# Run: ./scripts/setup-branch-protection.sh

set -e

BRANCH="main"
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

echo "🔒 Setting up branch protection for $BRANCH branch in $REPO..."

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed"
    echo "   Install it from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub CLI"
    echo "   Run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI is installed and authenticated"

# Set branch protection rules
echo ""
echo "📋 Configuring branch protection rules..."

gh api repos/$REPO/branches/$BRANCH/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["lint","test","build"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_reviews":false,"require_last_push_approval":false}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --field required_linear_history=true \
  --field allow_squash_merge=true \
  --field allow_merge_commit=false \
  --field allow_rebase_merge=true \
  --field require_conversation_resolution=true \
  --field require_signed_commits=false \
  --field lock_branch=false \
  --field allow_fork_syncing=false

echo "✅ Branch protection rules configured successfully!"
echo ""
echo "📝 Protection rules applied:"
echo "   ✓ Require pull request reviews (1 approval)"
echo "   ✓ Require status checks to pass (lint, test, build)"
echo "   ✓ Require branches to be up to date"
echo "   ✓ Require linear history"
echo "   ✓ Require conversation resolution"
echo "   ✓ Block force pushes"
echo "   ✓ Block branch deletion"
echo "   ✓ Enforce admins (admins must follow rules)"
echo "   ✓ Allow squash merge"
echo "   ✓ Allow rebase merge"
echo "   ✗ Block merge commits"
echo ""
echo "🎉 Branch protection setup complete!"

