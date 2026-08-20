import type { YhubClient } from './client.js'

export type AiRole = 'system' | 'user' | 'assistant'

export interface AiMessage {
  role: AiRole
  content: string
}

export interface AiChatOptions {
  model?: string
  temperature?: number
  maxOutputTokens?: number
}

export interface AiModel {
  id: string
}

export interface AiChatResult {
  id: string | null
  model: string
  message: AiMessage
  usage: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
  }
}

export interface AiUsage {
  period_start: string | null
  period_end: string | null
  requests: number
  request_budget: number
  input_tokens: number
  output_tokens: number
  tokens: number
  token_budget: number
}

export class AiClient {
  constructor(private readonly client: YhubClient) {}

  async models(): Promise<AiModel[]> {
    const response = await this.client.request<{ data: AiModel[] }>('GET', '/ai/models')
    return response.data
  }

  async chat(messages: AiMessage[], options: AiChatOptions = {}): Promise<AiChatResult> {
    const response = await this.client.request<{ data: AiChatResult }>('POST', '/ai/chat', {
      body: {
        messages,
        ...(options.model === undefined ? {} : { model: options.model }),
        ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
        ...(options.maxOutputTokens === undefined ? {} : { max_output_tokens: options.maxOutputTokens }),
      },
    })

    return response.data
  }

  async usage(): Promise<AiUsage> {
    const response = await this.client.request<{ data: AiUsage }>('GET', '/ai/usage')
    return response.data
  }
}
