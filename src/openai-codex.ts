import { createServer, type Server } from 'node:http'
import {
  createAuthFetch,
  generatePKCE,
  generateState,
  type AuthProvider,
  type OAuthTokens,
  type TokenRefreshFn,
} from '@vostride/agent-qa-core'

export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const CODEX_AUTH_BASE = 'https://auth.openai.com'
export const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token'
export const CODEX_SCOPES = 'openid profile email offline_access'
export const CODEX_API_URL = 'https://chatgpt.com/backend-api/codex/responses'
export const CODEX_DEFAULT_PORT = 1455
export const CODEX_CALLBACK_HOST = 'localhost'
export const CODEX_LISTEN_HOST = '127.0.0.1'

type JSONRecord = Record<string, unknown>

export function decodeJwtClaims(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length < 3) throw new Error('Invalid JWT: expected 3 segments')
  const payload = parts[1]
  const decoded = Buffer.from(payload, 'base64url').toString('utf-8')
  return JSON.parse(decoded)
}

function extractAccountId(idToken: string): string | undefined {
  try {
    const claims = decodeJwtClaims(idToken)
    const authClaim = claims['https://api.openai.com/auth'] as
      | Record<string, unknown>
      | undefined
    if (authClaim && typeof authClaim === 'object') {
      const userIdStr =
        (authClaim.user_id as string) ?? (authClaim.account_id as string)
      if (userIdStr) return userIdStr
    }
    return (claims.sub as string) ?? undefined
  } catch {
    return undefined
  }
}

export async function codexExchangeCode(
  code: string,
  redirectUri: string,
  pkce: { verifier: string },
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CODEX_CLIENT_ID,
    code,
    redirect_uri: redirectUri,
    code_verifier: pkce.verifier,
  })

  const res = await globalThis.fetch(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Codex token exchange failed: ${text}`)
  }

  const json = (await res.json()) as {
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
    id_token?: unknown
  }

  if (
    typeof json.access_token !== 'string'
    || typeof json.refresh_token !== 'string'
    || typeof json.expires_in !== 'number'
  ) {
    throw new Error('Codex token exchange response is missing required fields')
  }

  const accountId = typeof json.id_token === 'string'
    ? extractAccountId(json.id_token)
    : undefined

  return {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
    accountId,
  }
}

export const codexRefreshTokens: TokenRefreshFn = async (
  _provider: AuthProvider,
  refreshToken: string,
): Promise<OAuthTokens> => {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CODEX_CLIENT_ID,
    refresh_token: refreshToken,
  })

  const res = await globalThis.fetch(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Codex token refresh failed: ${text}`)
  }

  const json = (await res.json()) as {
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
    id_token?: unknown
  }

  if (
    typeof json.access_token !== 'string'
    || typeof json.expires_in !== 'number'
  ) {
    throw new Error('Codex token refresh response is missing required fields')
  }

  const accountId = typeof json.id_token === 'string'
    ? extractAccountId(json.id_token)
    : undefined

  return {
    access: json.access_token,
    refresh: typeof json.refresh_token === 'string' ? json.refresh_token : refreshToken,
    expires: Date.now() + json.expires_in * 1000,
    accountId,
  }
}

export async function codexBrowserAuth(options?: {
  port?: number
  listenHost?: string
}): Promise<{
  authorizeUrl: string
  waitForCallback: Promise<OAuthTokens>
  cleanup: () => void
}> {
  const port = options?.port ?? CODEX_DEFAULT_PORT
  const listenHost = options?.listenHost ?? CODEX_LISTEN_HOST
  const redirectUri = `http://${CODEX_CALLBACK_HOST}:${port}/auth/callback`
  const pkce = generatePKCE()
  const state = generateState()

  let server: Server
  let resolveTokens: (tokens: OAuthTokens) => void
  let rejectTokens: (err: Error) => void

  const waitForCallback = new Promise<OAuthTokens>((resolve, reject) => {
    resolveTokens = resolve
    rejectTokens = reject
  })

  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', redirectUri)

    if (url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')

      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end('<html><body>State mismatch. Please try again.</body></html>')
        rejectTokens(new Error('OAuth state mismatch'))
        return
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end('<html><body>Missing authorization code.</body></html>')
        rejectTokens(new Error('Missing authorization code'))
        return
      }

      try {
        const tokens = await codexExchangeCode(code, redirectUri, {
          verifier: pkce.verifier,
        })
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(
          '<html><body>Authentication successful! You can close this tab.</body></html>',
        )
        resolveTokens(tokens)
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' })
        res.end('<html><body>Token exchange failed.</body></html>')
        rejectTokens(
          err instanceof Error ? err : new Error('Token exchange failed'),
        )
      }
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, listenHost, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CODEX_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: CODEX_SCOPES,
    state,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
  })

  const authorizeUrl = `${CODEX_AUTH_BASE}/oauth/authorize?${params.toString()}`

  const cleanup = () => {
    server.close()
  }

  return { authorizeUrl, waitForCallback, cleanup }
}

export function createCodexAuthFetch(
  getTokens: () => Promise<OAuthTokens>,
  onRefreshed: (tokens: OAuthTokens) => Promise<void>,
): typeof globalThis.fetch {
  const authFetch = createAuthFetch({
    provider: 'openai-codex',
    getTokens,
    refreshTokens: codexRefreshTokens,
    onTokensRefreshed: onRefreshed,
    headerTransform: (headers, tokens) => {
      if (tokens.accountId) {
        headers.set('ChatGPT-Account-Id', tokens.accountId)
      }
    },
    urlTransform: (url) => {
      if (url.includes('/v1/responses') || url.includes('/chat/completions')) {
        return CODEX_API_URL
      }
      return url
    },
  })

  return async (input, init) => {
    const inputUrl = extractRequestUrl(input)
    let forceStream = false
    let body = init?.body

    if (isCodexRequestUrl(inputUrl) && body && typeof body === 'string') {
      try {
        const parsed = JSON.parse(body)
        if (!parsed.stream) {
          parsed.stream = true
          forceStream = true
        }
        if (parsed.text?.format?.strict) {
          parsed.text.format.strict = false
        }
        body = JSON.stringify(parsed)
      } catch {
        // Leave non-JSON request bodies unchanged.
      }
    }

    const response = await authFetch(input, { ...init, body })
    if (forceStream && response.ok && response.body) {
      return bufferCodexSSEResponse(response)
    }
    return response
  }
}

function extractRequestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function isCodexRequestUrl(url: string): boolean {
  return url.includes('/v1/responses')
    || url.includes('/chat/completions')
    || url.includes('chatgpt.com/backend-api/codex')
}

async function bufferCodexSSEResponse(response: Response): Promise<Response> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completedResponse: JSONRecord | null = null
  let outputText = ''
  const pendingOutputItems = new Map<number, JSONRecord>()
  const completedOutputItems = new Map<number, JSONRecord>()
  const functionCallArgumentDeltas = new Map<number, string>()
  const customToolInputDeltas = new Map<number, string>()

  const overallTimeout = setTimeout(() => {
    try { reader.cancel() } catch { /* ignore */ }
  }, 120_000)

  try {
    while (true) {
      const chunkPromise = reader.read()
      const timeoutPromise = new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), 30_000)
      )
      const { done, value } = await Promise.race([chunkPromise, timeoutPromise])
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const event = JSON.parse(data)
          if (!isJSONRecord(event) || typeof event.type !== 'string') continue

          if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
            outputText += event.delta
          }

          if (event.type === 'response.output_item.added'
            && typeof event.output_index === 'number'
            && isJSONRecord(event.item)
          ) {
            pendingOutputItems.set(event.output_index, { ...event.item })
          }

          if (event.type === 'response.function_call_arguments.delta'
            && typeof event.output_index === 'number'
            && typeof event.delta === 'string'
          ) {
            const prev = functionCallArgumentDeltas.get(event.output_index) ?? ''
            functionCallArgumentDeltas.set(event.output_index, prev + event.delta)
          }

          if (event.type === 'response.custom_tool_call_input.delta'
            && typeof event.output_index === 'number'
            && typeof event.delta === 'string'
          ) {
            const prev = customToolInputDeltas.get(event.output_index) ?? ''
            customToolInputDeltas.set(event.output_index, prev + event.delta)
          }

          if (event.type === 'response.output_item.done'
            && typeof event.output_index === 'number'
            && isJSONRecord(event.item)
          ) {
            completedOutputItems.set(
              event.output_index,
              hydrateOutputItem(event.item, event.output_index, functionCallArgumentDeltas, customToolInputDeltas),
            )
          }

          if ((event.type === 'response.completed' || event.type === 'response.incomplete')
            && isJSONRecord(event.response)
          ) {
            completedResponse = event.response
          }
        } catch {
          // Ignore malformed SSE payloads.
        }
      }
    }
  } finally {
    clearTimeout(overallTimeout)
  }

  for (const [outputIndex, item] of pendingOutputItems) {
    if (!completedOutputItems.has(outputIndex)) {
      completedOutputItems.set(
        outputIndex,
        hydrateOutputItem(item, outputIndex, functionCallArgumentDeltas, customToolInputDeltas),
      )
    }
  }

  const bufferedOutput = [...completedOutputItems.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, item]) => item)

  const body = JSON.stringify(
    ensureResponseMetadata(
      completedResponse
        ? mergeBufferedOutputItems(completedResponse, bufferedOutput, outputText)
        : createBufferedResponse(bufferedOutput, outputText),
    ),
  )

  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function isJSONRecord(value: unknown): value is JSONRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hydrateOutputItem(
  item: JSONRecord,
  outputIndex: number,
  functionCallArgumentDeltas: Map<number, string>,
  customToolInputDeltas: Map<number, string>,
): JSONRecord {
  const hydrated = { ...item }

  if (hydrated.type === 'function_call' && typeof hydrated.arguments !== 'string') {
    hydrated.arguments = functionCallArgumentDeltas.get(outputIndex) ?? ''
  }

  if (hydrated.type === 'custom_tool_call' && hydrated.input == null) {
    const input = customToolInputDeltas.get(outputIndex)
    if (input !== undefined) {
      hydrated.input = safeParseJSON(input) ?? input
    }
  }

  return hydrated
}

function mergeBufferedOutputItems(
  response: JSONRecord,
  bufferedOutput: JSONRecord[],
  outputText: string,
): JSONRecord {
  const existingOutput = Array.isArray(response.output)
    ? response.output.filter(isJSONRecord)
    : []

  if (bufferedOutput.length === 0) {
    if (existingOutput.length > 0) return response
    return { ...response, output: [buildTextOutput(outputText)] }
  }

  const mergedOutput = [...existingOutput]
  const seenKeys = new Set(existingOutput.map(getOutputItemKey).filter((key): key is string => key !== null))

  for (const item of bufferedOutput) {
    const key = getOutputItemKey(item)
    if (key && seenKeys.has(key)) continue
    if (key) seenKeys.add(key)
    mergedOutput.push(item)
  }

  return { ...response, output: mergedOutput }
}

function createBufferedResponse(bufferedOutput: JSONRecord[], outputText: string): JSONRecord {
  return {
    id: 'codex-buffered',
    output: bufferedOutput.length > 0 ? bufferedOutput : [buildTextOutput(outputText)],
    status: 'completed',
  }
}

function ensureResponseMetadata(response: JSONRecord): JSONRecord {
  if (typeof response.created_at === 'number') return response

  return {
    ...response,
    created_at: Math.floor(Date.now() / 1000),
  }
}

function buildTextOutput(outputText: string): JSONRecord {
  return {
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text: outputText, annotations: [] }],
  }
}

function getOutputItemKey(item: JSONRecord): string | null {
  const type = typeof item.type === 'string' ? item.type : 'unknown'

  if (typeof item.id === 'string') return `${type}:${item.id}`
  if (typeof item.call_id === 'string') return `${type}:${item.call_id}`

  return null
}

function safeParseJSON(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
