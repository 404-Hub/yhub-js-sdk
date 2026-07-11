export class YhubError extends Error {
  readonly status: number
  readonly errors?: Record<string, string[]>

  constructor(message: string, status: number, errors?: Record<string, string[]>) {
    super(message)
    this.name = 'YhubError'
    this.status = status
    this.errors = errors
  }
}
