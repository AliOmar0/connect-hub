# Branch Protection Rules

This document outlines the branch protection rules for the `main` branch to ensure code quality and prevent accidental force pushes or direct merges.

## Protection Rules

### Required Status Checks

All of the following checks must pass before a PR can be merged:

- ✅ **lint** - ESLint checks must pass
- ✅ **test** - All tests must pass (38+ tests)
- ✅ **build** - Project must build successfully

### Pull Request Requirements

- ✅ **Minimum 1 approval** required before merging
- ✅ **Require branches to be up to date** - PR must be rebased/merged with latest main
- ✅ **Require conversation resolution** - All PR comments must be resolved
- ✅ **Dismiss stale reviews** - Stale approvals are dismissed when new commits are pushed

### Merge Restrictions

- ✅ **Allow squash merge** - Recommended (creates clean history)
- ✅ **Allow rebase merge** - Allowed
- ❌ **Block merge commits** - Not allowed (keeps history linear)

### Force Push Protection

- ❌ **Block force pushes** - Force pushes to main are completely blocked
- ✅ **Require linear history** - No merge commits allowed

### Admin Enforcement

- ✅ **Enforce admins** - Even repository admins must follow these rules

## PR Requirements

### Title Format

PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): description
```

**Types:**

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `test` - Adding or updating tests
- `chore` - Maintenance tasks
- `perf` - Performance improvements
- `ci` - CI/CD changes
- `build` - Build system changes
- `revert` - Reverting a previous commit

**Examples:**

- ✅ `feat(auth): add login functionality`
- ✅ `fix(sessions): resolve realtime subscription issue`
- ✅ `test: add comprehensive test suite`
- ❌ `Update code` (missing type)
- ❌ `fix bug` (missing colon and scope)

### Commit Messages

All commits must follow conventional commits format:

```
type(scope): description

Optional body explaining what and why
```

### Code Quality Checks

- ✅ All tests must pass (minimum 38 tests)
- ✅ No linting errors
- ✅ TypeScript type checking passes
- ✅ Build succeeds
- ✅ No large files (>5MB) without Git LFS
- ✅ No sensitive data (API keys, passwords, etc.)

## Setting Up Branch Protection

### Option 1: Using GitHub CLI (Recommended)

```bash
chmod +x scripts/setup-branch-protection.sh
./scripts/setup-branch-protection.sh
```

### Option 2: Manual Setup via GitHub UI

1. Go to repository Settings → Branches
2. Click "Add rule" for `main` branch
3. Configure the following:
   - ✅ Require a pull request before merging
   - ✅ Require approvals: 1
   - ✅ Require status checks to pass: lint, test, build
   - ✅ Require branches to be up to date before merging
   - ✅ Require conversation resolution before merging
   - ✅ Require linear history
   - ✅ Do not allow bypassing the above settings
   - ✅ Restrict who can push to matching branches: (leave empty for admins)
   - ✅ Allow force pushes: ❌
   - ✅ Allow deletions: ❌
   - ✅ Allow squash merging: ✅
   - ✅ Allow merge commits: ❌
   - ✅ Allow rebase merging: ✅

## Workflow

### Creating a PR

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make your changes
3. Write tests for new functionality
4. Ensure all tests pass: `npm run test:run`
5. Ensure linting passes: `npm run lint`
6. Commit with conventional commit format
7. Push and create PR via Graphite or GitHub
8. Wait for CI checks to pass
9. Get at least 1 approval
10. Merge via squash or rebase (no merge commits)

### If CI Fails

1. Review the failing check
2. Fix the issue locally
3. Push the fix
4. CI will re-run automatically

### If PR Needs Updates

1. Make changes locally
2. Commit with conventional format
3. Push to your branch
4. PR will update automatically
5. Note: Stale approvals will be dismissed

## Bypassing Protection (Emergency Only)

⚠️ **Warning:** Bypassing protection should only be done in emergencies and requires admin access.

If absolutely necessary:

1. Go to repository Settings → Branches
2. Temporarily disable protection
3. Make the emergency change
4. Re-enable protection immediately
5. Document the bypass in a follow-up PR

## Monitoring

Check protection status:

```bash
gh api repos/OWNER/REPO/branches/main/protection
```

View protection rules in GitHub UI:

- Repository → Settings → Branches → `main` branch rule

## Troubleshooting

### "Required status check is missing"

- Ensure CI workflows are running
- Check that workflow files are in `.github/workflows/`
- Verify workflow names match: `lint`, `test`, `build`

### "Branch is out of date"

- Rebase your branch: `git rebase main`
- Or merge main into your branch: `git merge main`
- Push the updated branch

### "Conversation must be resolved"

- Review all PR comments
- Mark conversations as resolved
- Ensure all review comments are addressed

### "Force push blocked"

- Use `git rebase` instead of `git push --force`
- Or create a new branch if history is corrupted

## Additional Resources

- [GitHub Branch Protection Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
