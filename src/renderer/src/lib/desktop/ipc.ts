import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

type CommandArguments = Record<string, unknown>

function snakeCase(channel: string): string {
  return channel.replaceAll('-', '_')
}

function reportFailure(subject: string): (error: unknown) => void {
  return (error) => console.error(`Falha em ${subject}`, error)
}

export function command<Result = void>(channel: string, args?: CommandArguments): Promise<Result> {
  return invoke<Result>(snakeCase(channel), args)
}

export function send(channel: string, args?: CommandArguments): void {
  command(channel, args).catch(reportFailure(snakeCase(channel)))
}

export function subscribe<Payload>(event: string, listener: (payload: Payload) => void): () => void {
  const registration = listen<Payload>(event, (received) => listener(received.payload))
  registration.catch(reportFailure(event))
  return () => {
    registration.then((unlisten) => unlisten()).catch(reportFailure(event))
  }
}
