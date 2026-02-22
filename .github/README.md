# GitHub Configuration

This directory contains GitHub Actions workflows and branch protection configuration.

## Workflows

### `ci.yml` - Main CI Pipeline

Runs on every push and PR to `main` or `develop`:

- **lint** job: ESLint and TypeScript type checking
- **test** job: Runs all tests (38+ tests)
- **build** job: Verifies project builds successfully

All three jobs must pass before a PR can be merged.

### `pr-checks.yml` - PR Validation

Runs on PRs to validate:

- PR title follows conventional commits format
- No force pushes detected
- Commit messages follow conventional format
- No large files (>5MB)
- No sensitive data (API keys, passwords, etc.)
- Test coverage meets 95% threshold
- Bundle size check

### `security.yml` - Security Scanning

Runs on PRs, pushes, and weekly schedule:

- CodeQL analysis for JavaScript/TypeScript
- Dependency vulnerability scanning (npm audit)
- Secret scanning (Gitleaks)

### `test.yml` - Legacy Test Workflow

Kept for backward compatibility. Use `ci.yml` instead.

## Branch Protection

See [BRANCH_PROTECTION.md](./BRANCH_PROTECTION.md) for detailed documentation.

**Quick Setup:**

```bash
./scripts/setup-branch-protection.sh
```

## Required Status Checks

For PRs to be merged, these checks must pass:

- `lint` - Code linting and type checking
- `test` - All tests pass with 95% coverage
- `build` - Project builds successfully
- `validate-pr` - PR validation checks

## Testing

We maintain **95% test coverage** across all metrics. See [docs/TESTING.md](../docs/TESTING.md) for testing guidelines.

## CI/CD Documentation

For detailed information about workflows and troubleshooting, see:

- [Testing Guide](../docs/TESTING.md)
- [CI/CD Documentation](../docs/CI_CD.md)

## Files

- `ci.yml` - Main CI/CD workflow
- `pr-checks.yml` - PR validation checks
- `test.yml` - Legacy test workflow
- `BRANCH_PROTECTION.md` - Detailed protection rules documentation
- `BRANCH_PROTECTION_SETUP.md` - Quick setup guide
