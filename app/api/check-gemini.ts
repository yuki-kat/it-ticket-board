// Check if Gemini API is configured on the server
export async function OPTIONS(request: Request) {
  const host = request.headers.get('host') || ''
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': host,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
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

  const apiKey = process.env.GEMINI_API_KEY
  const available = !!apiKey
  return Response.json({ available }, {
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': host,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
