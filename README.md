# agent-qa-subscription-auth

Subscription LLM auth providers for agent-qa.

Install this package next to `agent-qa` when you want to use `openai-subscription` or `anthropic-subscription` providers. `agent-qa init` writes the dependency into `package.json` for subscription-auth configs; install it with the package manager your project already uses.

```json
{
  "devDependencies": {
    "@vostride/agent-qa-subscription-auth": "<agent-qa version>"
  }
}
```

Configure the `plugins.auth` array in `agent-qa.config.yaml`:

```yaml
plugins:
  auth:
    - package: "@vostride/agent-qa-subscription-auth"
```

Start `agent-qa dashboard` and authenticate subscription configs from the LLM configuration editor.

For local two-repo development, build this package and point AgentQA at the local entry file:

```yaml
plugins:
  auth:
    - path: "../agent-qa-subscription-auth/dist/index.js"
```

## Compatibility

This package is released at the same version as `agent-qa` and declares the peer dependency `@vostride/agent-qa-core >=0.1.0`. Keep the installed `agent-qa` and subscription-auth versions aligned.

## Release

Release operation, trusted publishing setup, and partial publish recovery are documented in [RELEASE.md](./RELEASE.md).

## License

- [License](LICENSE.md)
- [Notice](NOTICE.md)
