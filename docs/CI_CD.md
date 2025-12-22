# CI/CD Documentation

This document explains the CI/CD workflows and how to fix failing checks.

## Workflows

### CI Workflow (`.github/workflows/ci.yml`)

Runs on every push and pull request to `main` and `develop` branches.

**Jobs:**
1. **Lint** - Runs ESLint and TypeScript type checking
2. **Test** - Runs tests with coverage and uploads to Codecov
3. **Build** - Builds the project and verifies artifacts

**Status Checks:**
- `lint` - Linting and type checking
- `test` - Test execution and coverage
- `build` - Build verification

### PR Checks Workflow (`.github/workflows/pr-checks.yml`)

Runs on pull requests to validate PR requirements.

**Checks:**
- PR title format (conventional commits)
- Commit message format
- Force push detection
- Large file detection (>5MB)
- Sensitive data scanning
- Test coverage threshold (95%)
- Bundle size check

### Security Workflow (`.github/workflows/security.yml`)

Runs on PRs, pushes, and weekly schedule.

**Scans:**
- CodeQL analysis (JavaScript/TypeScript)
- Dependency vulnerability scan (npm audit)
- Secret scanning (Gitleaks)

## Fixing Failing Checks

### Lint Failures

```bash
# Run linter locally
npm run lint

# Auto-fix issues
npm run lint -- --fix
```

### Type Check Failures

```bash
# Check types locally
npx tsc --noEmit
```

### Test Failures

```bash
# Run tests locally
npm run test:run

# Run with coverage
npm run test:coverage
```

### Coverage Below Threshold

1. Review coverage report: `npm run test:coverage`
2. Open `coverage/index.html` in browser
3. Add tests for uncovered code
4. Ensure coverage meets 95% threshold

### PR Title Format

PR titles must follow conventional commits format:
- `feat(scope): description`
- `fix(scope): description`
- `docs: description`
- etc.

Examples:
- ✅ `feat(auth): add login functionality`
- ✅ `fix(ui): resolve button styling issue`
- ❌ `Add login` (missing type)
- ❌ `feat: add login` (missing description)

### Commit Message Format

Commit messages must follow the same format as PR titles.

### Security Vulnerabilities

If npm audit finds vulnerabilities:

```bash
# Check vulnerabilities
npm audit

# Fix automatically (if possible)
npm audit fix

# Review and update dependencies manually
```

### Bundle Size

If bundle size check fails:
1. Review what changed in the PR
2. Check for large dependencies
3. Consider code splitting or lazy loading
4. Update bundle size limits if justified

## Branch Protection

The `main` branch is protected with the following rules:

- ✅ Require 2 PR approvals
- ✅ Require status checks to pass (lint, test, build, validate-pr)
- ✅ Require branches to be up to date
- ✅ Require linear history
- ✅ Require conversation resolution
- ❌ Block force pushes
- ❌ Block branch deletion
- ✅ Enforce admins (admins must follow rules)

## Pre-commit Hooks

Husky runs pre-commit hooks automatically:

- **pre-commit**: Runs lint-staged (linting, formatting)
- **pre-push**: Runs tests
- **commit-msg**: Validates commit message format

To skip hooks (not recommended):
```bash
git commit --no-verify
```

## Local Development

### Running CI Checks Locally

```bash
# Run all checks
npm run lint && npm run test:run && npm run build

# Or use the CI script (if available)
npm run ci
```

### Pre-commit Setup

Husky is automatically set up when you run `npm install`. If hooks aren't working:

```bash
npm run prepare
```

## Status Check Names

Required status checks (must pass before merge):
- `lint`
- `test`
- `build`
- `validate-pr`

Optional checks (informational):
- `codeql-analysis`
- `dependency-scan`
- `secret-scanning`

## Troubleshooting

### "Required status checks must pass"

1. Check which checks are failing
2. Click on the failing check to see details
3. Fix the issues locally
4. Push fixes to your branch

### "Branch is out of date"

```bash
# Update your branch
git fetch origin main
git rebase origin/main
# Or
git merge origin/main
```

### "Force push detected"

Don't force push. Instead:
```bash
git rebase origin/main
git push --force-with-lease
```

### Coverage Upload Fails

Coverage upload failures don't block merges but should be investigated. Check:
- Codecov token is set (if using)
- Coverage file exists: `coverage/coverage-final.json`
- File format is correct

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Codecov Documentation](https://docs.codecov.com/)

