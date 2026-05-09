# Release Setup

This package publishes `@vostride/agent-qa-subscription-auth` from the main `vostride/agent-qa` release workflow so its version stays aligned with `agent-qa`.

## Local Preflight

Run the non-mutating dry run before starting a hosted release:

```bash
pnpm install --frozen-lockfile
pnpm run release:dry-run -- --bump patch
```

Use `--bump minor` when intentionally advancing the 0.x minor line. The main `agent-qa` release workflow passes the exact target version into this package's release scripts.

## GitHub And npm Setup

The hosted release runs from `vostride/agent-qa/.github/workflows/release.yml` through manual `workflow_dispatch`.

Configure npm trusted publishing for:

- Package: `@vostride/agent-qa-subscription-auth`
- GitHub owner: `vostride`
- Repository: `agent-qa`
- Workflow: `.github/workflows/release.yml`

No NPM_TOKEN is used. The workflow uses GitHub Actions OIDC with `id-token: write`, npm CLI trusted publishing support, and `npm publish --access public` from `.release/package`.

The `agent-qa` workflow checks out `vostride/agent-qa-subscription-auth` with `SUBSCRIPTION_AUTH_RELEASE_TOKEN` so it can write the release commit and tag back to this repository.

## First Hosted Release Checklist

1. Confirm the repository remote points at `vostride/agent-qa-subscription-auth`.
2. Confirm npm trusted publishing matches `vostride/agent-qa/.github/workflows/release.yml`.
3. Run `pnpm run release:dry-run -- --bump patch` locally.
4. Confirm `SUBSCRIPTION_AUTH_RELEASE_TOKEN` is configured in `vostride/agent-qa` with write access to this repository.
5. Trigger the `vostride/agent-qa` `Release` workflow with `workflow_dispatch` and choose `patch` or `minor`.
6. After the hosted publish, confirm npm provenance is shown for `@vostride/agent-qa-subscription-auth`.

## Compatibility Policy

The staged package keeps the peer dependency contract `@vostride/agent-qa-core >=0.1.0`. Keep new plugin releases compatible with the published `agent-qa` core API unless a future release deliberately raises that peer range.

The package source version is kept aligned with `agent-qa`. Compatibility is anchored by the peer dependency and the README install guidance.

## Recovery

The workflow verifies npm version availability and git tag availability before writing the version, committing, tagging, pushing, or publishing.

If a tag push fails before npm publish, fix the blocker and rerun the same release only if the package version still does not exist on npm.

If an npm package partial publish happens or the version already exists, never overwrite or unpublish/reuse that version. Fix the blocker, bump forward to the next patch or minor version, and publish that new version instead.
