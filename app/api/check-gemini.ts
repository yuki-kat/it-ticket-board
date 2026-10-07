// Check if Vercel AI Gateway is configured on the server.
export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host') || ''

  if (origin) {
    try {
      const originUrl = new URL(origin)
      const hostWithoutPort = host.split(':')[0]
      const originHostWithoutPort = originUrl.hostname

      // Only allow if origin hostname matches request host hostname
      if (originHostWithoutPort !== hostWithoutPort) {
        return new Response(null, { status: 403 })
      }
    } catch {
      return new Response(null, { status: 403 })
    }
  }

  const headers: Record<string, string> = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return new Response(null, {
    status: 204,
    headers,
  })
}

export async function GET(request: Request) {
  // Validate origin for CORS: allow same-origin requests or configured origins
  const origin = request.headers.get('origin')
  const host = request.headers.get('host') || ''

  // If origin header is present, verify it matches the request host
  if (origin) {
    try {
      const originUrl = new URL(origin)
      const hostWithoutPort = host.split(':')[0]
      const originHostWithoutPort = originUrl.hostname

      // Allow only if origin hostname matches request host hostname
      if (originHostWithoutPort !== hostWithoutPort) {
        return Response.json({ error: 'Not allowed.' }, { status: 403 })
      }
    } catch {
      // Invalid origin URL
      return Response.json({ error: 'Not allowed.' }, { status: 403 })
    }
  }
  // If no origin header (same-origin GET requests), allow through

  const apiKey = process.env.AI_GATEWAY_API_KEY
  const available = Boolean(apiKey?.trim())

  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return Response.json({ available }, { headers })
}
