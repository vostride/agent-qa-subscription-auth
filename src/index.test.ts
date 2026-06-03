import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  anthropicRefreshTokens,
  CODEX_API_URL,
  codexBrowserAuth,
  codexRefreshTokens,
  createAnthropicAuthFetch,
  createCodexAuthFetch,
  createSubscriptionAuthPlugin,
} from './index.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('createSubscriptionAuthPlugin', () => {
  it('registers OpenAI and Anthropic subscription providers', () => {
    const plugin = createSubscriptionAuthPlugin()

    expect(plugin.providers.map((provider) => provider.providerId)).toEqual([
      'openai-subscription',
      'anthropic-subscription',
    ])
    expect(plugin.providers[0]).toMatchObject({
      credentialProviderId: 'openai-subscription-oauth',
      modelAdapter: 'openai-responses',
      dashboardAuth: { mode: 'browser-poll' },
    })
    expect(plugin.providers[1]).toMatchObject({
      credentialProviderId: 'anthropic-subscription',
      modelAdapter: 'anthropic-messages',
      dashboardAuth: { mode: 'manual-code' },
    })
  })
})

describe('createCodexAuthFetch', () => {
  it('routes Responses API requests through the Codex backend and relaxes strict schemas', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    const authFetch = createCodexAuthFetch(
      async () => ({
        access: 'access-token',
        refresh: 'refresh-token',
        expires: Date.now() + 3600000,
        accountId: 'account-1',
      }),
      vi.fn(),
    )

    await authFetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gpt-5.3-codex',
        text: { format: { strict: true } },
      }),
    })

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    const headers = new Headers((init as RequestInit).headers)

    expect(url).toBe(CODEX_API_URL)
    expect(body.stream).toBe(true)
    expect(body.text.format.strict).toBe(false)
    expect(headers.get('Authorization')).toBe('Bearer access-token')
    expect(headers.get('ChatGPT-Account-Id')).toBe('account-1')
  })
})

describe('OAuth token refresh', () => {
  it('preserves the existing OpenAI refresh token when refresh responses omit rotation', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'new-access',
      expires_in: 3600,
    }), { status: 200 }))

    const tokens = await codexRefreshTokens('openai-subscription', 'existing-refresh')

    expect(tokens).toMatchObject({
      access: 'new-access',
      refresh: 'existing-refresh',
    })
  })

  it('preserves the existing Anthropic refresh token when refresh responses omit rotation', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'new-access',
      expires_in: 3600,
    }), { status: 200 }))

    const tokens = await anthropicRefreshTokens('anthropic-subscription', 'existing-refresh')

    expect(tokens).toMatchObject({
      access: 'new-access',
      refresh: 'existing-refresh',
    })
  })
})

describe('codexBrowserAuth', () => {
  it('rejects cleanly when the callback port is already in use', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200)
      res.end('busy')
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })

    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    await expect(codexBrowserAuth({ port, listenHost: '127.0.0.1' })).rejects.toMatchObject({
      code: 'EADDRINUSE',
    })

    await new Promise<void>((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve())
    })
  })
})

describe('createAnthropicAuthFetch', () => {
  it('adds the system prefix once and keeps tool-name rewriting idempotent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    const authFetch = createAnthropicAuthFetch(
      async () => ({
        access: 'access-token',
        refresh: 'refresh-token',
        expires: Date.now() + 3600000,
      }),
      vi.fn(),
    )

    await authFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        system: [{ type: 'text', text: 'Project instructions' }],
        tools: [{ name: 'search' }, { name: 'mcp_existing' }],
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'tool_use', name: 'lookup' },
              { type: 'tool_use', name: 'mcp_done' },
            ],
          },
        ],
      }),
    })

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))

    expect(body.system).toEqual([
      { type: 'text', text: "You are Claude Code, Anthropic's official CLI for Claude." },
      { type: 'text', text: 'Project instructions' },
    ])
    expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual(['mcp_search', 'mcp_existing'])
    expect(body.messages[0].content.map((block: { name: string }) => block.name)).toEqual(['mcp_lookup', 'mcp_done'])
  })

  it('rewrites streamed tool_use names across chunk boundaries without touching model text', async () => {
    const encoder = new TextEncoder()
    const chunks = [
      'data: {"type":"content_block_start","content_block":{"type":"tool_use","name":"m',
      'cp_lookup"}}\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"name\\":\\"mcp_literal\\"}"}}\n',
    ]
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }), { status: 200 }))
    const authFetch = createAnthropicAuthFetch(
      async () => ({
        access: 'access-token',
        refresh: 'refresh-token',
        expires: Date.now() + 3600000,
      }),
      vi.fn(),
    )

    const response = await authFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ messages: [] }),
    })

    const text = await response.text()

    expect(text).toContain('"name":"lookup"')
    expect(text).toContain('mcp_literal')
  })

  it('strips the tool-name prefix from non-streaming JSON responses', async () => {
    const payload = {
      type: 'message',
      content: [
        { type: 'text', text: '{"name":"mcp_literal"}' },
        { type: 'tool_use', name: 'mcp_lookup' },
        { type: 'tool_use', name: 'search' },
      ],
    }
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': '123',
          'content-encoding': 'gzip',
        },
      }),
    )
    const authFetch = createAnthropicAuthFetch(
      async () => ({
        access: 'access-token',
        refresh: 'refresh-token',
        expires: Date.now() + 3600000,
      }),
      vi.fn(),
    )

    const response = await authFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ messages: [] }),
    })

    const body = (await response.json()) as { content: { name?: string, text?: string }[] }

    expect(body.content[0].text).toBe('{"name":"mcp_literal"}')
    expect(body.content.map((block) => block.name)).toEqual([undefined, 'lookup', 'search'])
    expect(response.headers.has('content-length')).toBe(false)
    expect(response.headers.has('content-encoding')).toBe(false)
  })
})
