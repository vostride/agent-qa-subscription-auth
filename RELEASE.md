# Release Setup

This package publishes `@vostride/agent-qa-subscription-auth` from this repository's release workflow. The main `vostride/agent-qa` release workflow dispatches this workflow with the exact target version so both packages stay aligned.

## Local Preflight

Run the non-mutating dry run before starting a hosted release:

```bash
pnpm install --frozen-lockfile
pnpm run release:dry-run -- --bump patch
```

Use `--bump minor` when intentionally advancing the 0.x minor line. The main `agent-qa` release workflow passes the exact target version into this package's release scripts.

## GitHub And npm Setup

The hosted package publish runs from `vostride/agent-qa-subscription-auth/.github/workflows/release.yml`. The main `vostride/agent-qa/.github/workflows/release.yml` triggers it with `workflow_dispatch`.

Configure npm trusted publishing for:

- Package: `@vostride/agent-qa-subscription-auth`
- GitHub owner: `vostride`
- Repository: `agent-qa-subscription-auth`
- Workflow: `.github/workflows/release.yml`

No NPM_TOKEN is used. The workflow uses GitHub Actions OIDC with `id-token: write`, npm CLI trusted publishing support, and `npm publish --access public` from `.release/package`.

The `agent-qa` workflow uses `SUBSCRIPTION_AUTH_RELEASE_TOKEN` only to dispatch and watch this repository's release workflow. That token needs Actions read/write access on `vostride/agent-qa-subscription-auth`.

## First Hosted Release Checklist

1. Confirm the repository remote points at `vostride/agent-qa-subscription-auth`.
2. Confirm npm trusted publishing matches `vostride/agent-qa-subscription-auth/.github/workflows/release.yml`.
3. Run `pnpm run release:dry-run -- --bump patch` locally.
4. Confirm `SUBSCRIPTION_AUTH_RELEASE_TOKEN` is configured in `vostride/agent-qa` with Actions read/write access to this repository.
5. Trigger the `vostride/agent-qa` `Release` workflow with `workflow_dispatch` and choose `patch` or `minor`.
6. After the hosted publish, confirm npm provenance is shown for `@vostride/agent-qa-subscription-auth`.

## Compatibility Policy

The staged package keeps the peer dependency contract `@vostride/agent-qa-core >=0.1.0`. Keep new plugin releases compatible with the published `agent-qa` core API unless a future release deliberately raises that peer range.

The package source version is kept aligned with `agent-qa`. Compatibility is anchored by the peer dependency and the README install guidance.

## Recovery

The workflow verifies npm version availability and git tag availability before writing the version, committing, tagging, pushing, or publishing.

If a tag push succeeds but npm publish fails, fix the blocker and dispatch the same `target_version` again only if the package version still does not exist on npm. The workflow allows an existing git tag for exact-version recovery and still checks npm version absence before publishing.

If an npm package partial publish happens or the version already exists, never overwrite or unpublish/reuse that version. Fix the blocker, bump forward to the next patch or minor version, and publish that new version instead.
