import {
  generatePKCE,
  type AuthProvider,
  type OAuthTokens,
  type TokenRefreshFn,
} from '@vostride/agent-qa-core'

export const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
export const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
export const ANTHROPIC_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback'
export const ANTHROPIC_SCOPES = 'org:create_api_key user:profile user:inference'
export const ANTHROPIC_BETA_FLAGS = 'oauth-2025-04-20,interleaved-thinking-2025-05-14'

const SYSTEM_PREFIX = "You are Claude Code, Anthropic's official CLI for Claude."
const TOOL_PREFIX = 'mcp_'

const AUTH_BASES: Record<string, string> = {
  max: 'https://claude.ai/oauth/authorize',
  console: 'https://console.anthropic.com/oauth/authorize',
}

export function anthropicAuthorizeUrl(options: {
  mode: 'max' | 'console'
  pkce: { verifier: string; challenge: string }
}): string {
  const base = AUTH_BASES[options.mode]
  const params = new URLSearchParams({
    code: 'true',
    client_id: ANTHROPIC_CLIENT_ID,
    response_type: 'code',
    redirect_uri: ANTHROPIC_REDIRECT_URI,
    scope: ANTHROPIC_SCOPES,
    code_challenge: options.pkce.challenge,
    code_challenge_method: 'S256',
    state: options.pkce.verifier,
  })
  return `${base}?${params.toString()}`
}

export function startAnthropicAuth(): {
  authorizeUrl: string
  sessionState: { verifier: string }
} {
  const pkce = generatePKCE()
  return {
    authorizeUrl: anthropicAuthorizeUrl({ mode: 'max', pkce }),
    sessionState: { verifier: pkce.verifier },
  }
}

function readVerifier(sessionState: unknown): string {
  if (
    sessionState
    && typeof sessionState === 'object'
    && typeof (sessionState as { verifier?: unknown }).verifier === 'string'
  ) {
    return (sessionState as { verifier: string }).verifier
  }
  throw new Error('Anthropic subscription auth session is missing PKCE verifier.')
}

export async function exchangeAnthropicManualCode(ctx: {
  code: string
  sessionState: unknown
}): Promise<OAuthTokens> {
  return await anthropicExchangeCode(ctx.code, { verifier: readVerifier(ctx.sessionState) })
}

export async function anthropicExchangeCode(
  codeWithState: string,
  pkce: { verifier: string },
): Promise<OAuthTokens> {
  const [code, state] = codeWithState.split('#')

  const res = await globalThis.fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      state: state ?? pkce.verifier,
      grant_type: 'authorization_code',
      client_id: ANTHROPIC_CLIENT_ID,
      redirect_uri: ANTHROPIC_REDIRECT_URI,
      code_verifier: pkce.verifier,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Anthropic token exchange failed: ${text}`)
  }

  const json = (await res.json()) as {
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
  }

  if (
    typeof json.access_token !== 'string'
    || typeof json.refresh_token !== 'string'
    || typeof json.expires_in !== 'number'
  ) {
    throw new Error('Anthropic token exchange response is missing required fields')
  }

  return {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
  }
}

export const anthropicRefreshTokens: TokenRefreshFn = async (
  _provider: AuthProvider,
  refreshToken: string,
): Promise<OAuthTokens> => {
  const res = await globalThis.fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: ANTHROPIC_CLIENT_ID,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Anthropic token refresh failed: ${text}`)
  }

  const json = (await res.json()) as {
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
  }

  if (
    typeof json.access_token !== 'string'
    || typeof json.expires_in !== 'number'
  ) {
    throw new Error('Anthropic token refresh response is missing required fields')
  }

  return {
    access: json.access_token,
    refresh: typeof json.refresh_token === 'string' ? json.refresh_token : refreshToken,
    expires: Date.now() + json.expires_in * 1000,
  }
}

function prefixToolName(name: unknown): unknown {
  return typeof name === 'string' && !name.startsWith(TOOL_PREFIX) ? `${TOOL_PREFIX}${name}` : name
}

function stripToolNamePrefix(name: unknown): unknown {
  return typeof name === 'string' && name.startsWith(TOOL_PREFIX) ? name.slice(TOOL_PREFIX.length) : name
}

export function createAnthropicAuthFetch(
  getTokens: () => Promise<OAuthTokens>,
  onRefreshed: (tokens: OAuthTokens) => Promise<void>,
): typeof globalThis.fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    let tokens = await getTokens()

    if (tokens.expires < Date.now()) {
      tokens = await anthropicRefreshTokens('anthropic-subscription', tokens.refresh)
      await onRefreshed(tokens)
    }

    const headers = new Headers()
    if (input instanceof Request) {
      input.headers.forEach((value, key) => { headers.set(key, value) })
    }
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => { headers.set(key, value) })
      } else if (Array.isArray(init.headers)) {
        for (const [key, value] of init.headers) {
          if (value !== undefined) headers.set(key, String(value))
        }
      } else {
        for (const [key, value] of Object.entries(init.headers)) {
          if (value !== undefined) headers.set(key, String(value))
        }
      }
    }

    const incoming = (headers.get('anthropic-beta') || '').split(',').map((b) => b.trim()).filter(Boolean)
    const required = ANTHROPIC_BETA_FLAGS.split(',')
    const merged = [...new Set([...required, ...incoming])].join(',')

    headers.delete('authorization')
    headers.delete('x-api-key')
    headers.set('Authorization', `Bearer ${tokens.access}`)
    headers.set('anthropic-beta', merged)
    headers.set('user-agent', 'claude-cli/2.1.2 (external, cli)')

    let body = init?.body
    if (body && typeof body === 'string') {
      try {
        const parsed = JSON.parse(body)

        if (parsed.system && Array.isArray(parsed.system)) {
          parsed.system = [{ type: 'text', text: SYSTEM_PREFIX }, ...parsed.system]
        } else if (typeof parsed.system === 'string') {
          parsed.system = SYSTEM_PREFIX + '\n\n' + parsed.system
        } else if (!parsed.system) {
          parsed.system = [{ type: 'text', text: SYSTEM_PREFIX }]
        }

        if (parsed.tools && Array.isArray(parsed.tools)) {
          parsed.tools = parsed.tools.map((tool: Record<string, unknown>) => ({
            ...tool,
            name: prefixToolName(tool.name),
          }))
        }

        if (parsed.messages && Array.isArray(parsed.messages)) {
          parsed.messages = parsed.messages.map((msg: Record<string, unknown>) => {
            if (msg.content && Array.isArray(msg.content)) {
              msg.content = msg.content.map((block: Record<string, unknown>) => {
                if (block.type === 'tool_use' && block.name) {
                  return { ...block, name: prefixToolName(block.name) }
                }
                return block
              })
            }
            return msg
          })
        }

        body = JSON.stringify(parsed)
      } catch {
        // Leave non-JSON request bodies unchanged.
      }
    }

    let url: string
    if (typeof input === 'string') url = input
    else if (input instanceof URL) url = input.toString()
    else url = input.url

    try {
      const parsed = new URL(url)
      if (parsed.pathname === '/v1/messages' && !parsed.searchParams.has('beta')) {
        parsed.searchParams.set('beta', 'true')
        url = parsed.toString()
      }
    } catch {
      // Leave invalid URLs unchanged.
    }

    const response = await globalThis.fetch(url, {
      ...init,
      body,
      headers,
    })

    if (!response.ok) {
      const text = await response.text()
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    }

    if (response.body) {
      const stream = response.body.pipeThrough(createAnthropicToolNameTransform())

      return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    }

    return response
  }
}

function createAnthropicToolNameTransform(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let pending = ''

  return new TransformStream({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true })

      let newlineIndex = pending.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = pending.slice(0, newlineIndex + 1)
        pending = pending.slice(newlineIndex + 1)
        controller.enqueue(encoder.encode(rewriteAnthropicEventLine(line)))
        newlineIndex = pending.indexOf('\n')
      }
    },
    flush(controller) {
      pending += decoder.decode()
      if (pending) {
        controller.enqueue(encoder.encode(rewriteAnthropicEventLine(pending)))
        pending = ''
      }
    },
  })
}

function rewriteAnthropicEventLine(line: string): string {
  const match = /^(data:\s*)(.*?)(\r?\n?)$/.exec(line)
  if (!match) return line

  const [, prefix, jsonText, suffix] = match
  if (!jsonText || jsonText === '[DONE]') return line

  try {
    const event = JSON.parse(jsonText)
    rewriteToolUseNames(event)
    return `${prefix}${JSON.stringify(event)}${suffix}`
  } catch {
    return line
  }
}

function rewriteToolUseNames(value: unknown): void {
  if (!value || typeof value !== 'object') return

  if (Array.isArray(value)) {
    for (const item of value) rewriteToolUseNames(item)
    return
  }

  const record = value as Record<string, unknown>
  if (record.type === 'tool_use') {
    record.name = stripToolNamePrefix(record.name)
  }

  for (const item of Object.values(record)) {
    rewriteToolUseNames(item)
  }
}
