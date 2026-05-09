import type { LLMAuthProviderPlugin } from '@vostride/agent-qa-core'
import { createAnthropicAuthFetch, exchangeAnthropicManualCode, startAnthropicAuth } from './anthropic.js'
import { codexBrowserAuth, createCodexAuthFetch } from './openai-codex.js'

export function createSubscriptionAuthPlugin(): { providers: LLMAuthProviderPlugin[] } {
  return {
    providers: [
      {
        providerId: 'openai-subscription',
        credentialProviderId: 'openai-subscription-oauth',
        label: 'OpenAI subscription',
        modelAdapter: 'openai-responses',
        dashboardAuth: { mode: 'browser-poll', buttonLabel: 'Login with OpenAI subscription' },
        async startAuth() {
          const result = await codexBrowserAuth()
          return {
            authorizeUrl: result.authorizeUrl,
            waitForTokens: result.waitForCallback,
            cleanup: result.cleanup,
          }
        },
        createAuthFetch({ getTokens, onRefreshed }) {
          return createCodexAuthFetch(getTokens, onRefreshed)
        },
      },
      {
        providerId: 'anthropic-subscription',
        credentialProviderId: 'anthropic-subscription',
        label: 'Anthropic subscription',
        modelAdapter: 'anthropic-messages',
        dashboardAuth: { mode: 'manual-code', buttonLabel: 'Login with Anthropic subscription' },
        async startAuth() {
          return startAnthropicAuth()
        },
        async exchangeCode(ctx) {
          return await exchangeAnthropicManualCode(ctx)
        },
        createAuthFetch({ getTokens, onRefreshed }) {
          return createAnthropicAuthFetch(getTokens, onRefreshed)
        },
      },
    ],
  }
}

export default createSubscriptionAuthPlugin

export {
  ANTHROPIC_BETA_FLAGS,
  ANTHROPIC_CLIENT_ID,
  ANTHROPIC_REDIRECT_URI,
  ANTHROPIC_SCOPES,
  ANTHROPIC_TOKEN_URL,
  anthropicAuthorizeUrl,
  anthropicExchangeCode,
  anthropicRefreshTokens,
  createAnthropicAuthFetch,
} from './anthropic.js'

export {
  CODEX_API_URL,
  CODEX_AUTH_BASE,
  CODEX_CLIENT_ID,
  CODEX_DEFAULT_PORT,
  CODEX_SCOPES,
  CODEX_TOKEN_URL,
  codexBrowserAuth,
  codexExchangeCode,
  codexRefreshTokens,
  createCodexAuthFetch,
  decodeJwtClaims,
} from './openai-codex.js'
