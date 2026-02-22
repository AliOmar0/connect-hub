# Quick Setup Guide: Branch Protection

This guide will help you quickly set up branch protection for the `main` branch.

## 🚀 Quick Start (Automated)

### Step 1: Install GitHub CLI

```bash
# macOS
brew install gh

# Linux (Debian/Ubuntu)
sudo apt install gh

# Windows
winget install GitHub.cli
```

### Step 2: Authenticate

```bash
gh auth login
```

### Step 3: Run Setup Script

```bash
chmod +x scripts/setup-branch-protection.sh
./scripts/setup-branch-protection.sh
```

Done! Your `main` branch is now protected. ✅

## 📋 What Gets Protected

After running the script, your `main` branch will have:

### ✅ Required Checks (Must Pass)

- **lint** - Code linting
- **test** - All tests (38+ tests)
- **build** - Project builds successfully

### ✅ PR Requirements

- Minimum **1 approval** required
- Branch must be **up to date** with main
- All **conversations must be resolved**
- **Stale reviews** are dismissed on new commits

### ❌ Blocked Actions

- **Force pushes** - Completely blocked
- **Branch deletion** - Blocked
- **Merge commits** - Not allowed (keeps history clean)
- **Direct pushes** - Must use PRs

### ✅ Allowed Merge Methods

- **Squash merge** ✅ (Recommended - clean history)
- **Rebase merge** ✅ (Clean history)
- **Merge commit** ❌ (Not allowed)

## 🔍 Verify Protection

Check if protection is active:

```bash
gh api repos/OWNER/REPO/branches/main/protection
```

Or visit: `https://github.com/OWNER/REPO/settings/branches`

## 📝 PR Requirements

When creating PRs, ensure:

1. **Title follows format**: `type(scope): description`
   - ✅ `feat(auth): add login`
   - ❌ `Update code`

2. **All commits follow format**: `type: description`
   - ✅ `fix: resolve bug`
   - ❌ `fixed bug`

3. **All checks pass**:
   - Lint ✅
   - Tests ✅ (38+ tests)
   - Build ✅

4. **Get approval** from at least 1 reviewer

## 🆘 Troubleshooting

### "Required status check is missing"

The CI workflow needs to run first. Create a test PR to trigger it, or manually run:

```bash
gh workflow run ci.yml
```

### "Branch is out of date"

```bash
git checkout your-branch
git rebase main
git push --force-with-lease
```

### Script fails with "Not authenticated"

```bash
gh auth login
gh auth status  # Verify
```

### Script fails with "gh: command not found"

Install GitHub CLI from: https://cli.github.com/

## 📚 More Information

See [BRANCH_PROTECTION.md](./BRANCH_PROTECTION.md) for detailed documentation.
