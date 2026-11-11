# agent-qa-subscription-auth

Sign-in for agent-qa's `openai-subscription` and `anthropic-subscription` providers, so a ChatGPT or Claude subscription can be the model instead of an API key.

## Install

Run init and pick a subscription model, `claude-code` or `codex`:

```bash
npx agent-qa@latest init
```

init declares `agent-qa` and this package in `package.json` at the same exact version, installs both, and writes this entry to `agent-qa.config.yaml`:

```yaml
plugins:
  - name: subscription
    package: "@vostride/agent-qa-subscription-auth"
```

In a project that is already set up, `npx agent-qa plugins add @vostride/agent-qa-subscription-auth` declares and installs this package at agent-qa's version and writes the same entry.

## Sign in

```bash
npx agent-qa auth login --config <name>
```

`<name>` is the model's name in `agent-qa.config.yaml`: `claude-code` or `codex` when init wrote it.

## Compatibility

This package is released at agent-qa's version, and init pins both to the same exact version.

## Local development

Build this package with agent-qa checked out beside it, then declare it in the project's `package.json` with a `file:` spec that points at this folder. init leaves that entry as declared.

## Release

Release operation, trusted publishing setup, and partial publish recovery are documented in [RELEASE.md](./RELEASE.md).

## License

- [License](LICENSE.md)
- [Notice](NOTICE.md)
