import type { Prompt } from 'ssh2'
import type { SshConnectionCallbacks } from './ssh-connection-utils'

export const MAX_KEYBOARD_INTERACTIVE_PROMPTS = 32

type KeyboardInteractiveAnswerRequest = {
  targetId: string
  interactionName: string
  instructions: string
  prompts: Prompt[]
  callbacks: SshConnectionCallbacks
  signal: AbortSignal
}

export async function requestKeyboardInteractiveAnswers({
  targetId,
  interactionName,
  instructions,
  prompts,
  callbacks,
  signal
}: KeyboardInteractiveAnswerRequest): Promise<string[] | null | undefined> {
  const requestCredential = callbacks.onCredentialRequest
  if (!requestCredential || prompts.length > MAX_KEYBOARD_INTERACTIVE_PROMPTS) {
    return undefined
  }
  if (signal.aborted) {
    return null
  }

  const answers: string[] = []
  for (const [index, prompt] of prompts.entries()) {
    const answer = await requestCredential(
      targetId,
      'keyboard-interactive',
      prompt.prompt,
      {
        interactionName,
        instructions,
        echo: prompt.echo === true,
        promptIndex: index + 1,
        promptCount: prompts.length
      },
      signal
    )
    if (answer === null || signal.aborted) {
      return null
    }
    answers.push(answer)
  }
  return answers
}
