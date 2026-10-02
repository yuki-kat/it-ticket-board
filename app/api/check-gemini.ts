// Check if Gemini API is configured on the server
export async function GET(request: Request) {
  // Only allow same-origin requests (Origin header not always present for same-origin)
  const origin = request.headers.get('origin')
  if (origin) {
    try {
      const originUrl = new URL(origin)
      const hostHeader = request.headers.get('host') || ''
      // Compare hostnames only; ports are complex with headers vs URLs
      if (originUrl.hostname !== hostHeader.split(':')[0]) {
        return Response.json({ error: 'Not allowed.' }, { status: 403 })
      }
    } catch {
      return Response.json({ error: 'Not allowed.' }, { status: 403 })
    }
  }

  const apiKey = process.env.GEMINI_API_KEY
  const available = !!apiKey
  return Response.json({ available }, { headers: { 'Cache-Control': 'no-store' } })
}
