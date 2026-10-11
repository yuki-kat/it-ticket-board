// An AI failure the UI can show as-is: `status` is the HTTP status the route should answer with.
export class AiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}
