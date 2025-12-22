# Scripts

This directory contains utility scripts for repository management.

## setup-branch-protection.sh

Sets up comprehensive branch protection rules for the `main` branch using GitHub CLI.

### Prerequisites
- GitHub CLI (`gh`) installed: https://cli.github.com/
- Authenticated with GitHub: `gh auth login`

### Usage
```bash
./scripts/setup-branch-protection.sh
```

### What it does
- Configures branch protection for `main` branch
- Requires status checks: lint, test, build
- Requires 1 PR approval
- Blocks force pushes
- Blocks branch deletion
- Requires linear history
- Enforces rules for admins too

### Manual Alternative
See [BRANCH_PROTECTION.md](../.github/BRANCH_PROTECTION.md) for manual setup instructions via GitHub UI.

