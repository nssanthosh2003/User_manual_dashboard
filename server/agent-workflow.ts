import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'

const CACHE_SCHEMA_VERSION = 1
const ANALYSIS_PROMPT_VERSION = 'manual-text-generation-v1'
const agentCacheDir = path.join(process.cwd(), 'storage', 'agent-cache')

export type ScreenshotAnalysisResult = {
  summary: string
  visibleChanges: string[]
  extractedText: string[]
  impacts: string[]
}

export type TextGenerationResult = {
  screenshotAnalysis: ScreenshotAnalysisResult
  userManualText: string
  releaseNotesText: string
  headingsAndSectionsDetected?: string[]
}

export function requireClient() {
  const baseURL = process.env.OPENAI_BASE_URL
  const apiKey = [process.env.AZURE_AI_ACCESS_TOKEN, process.env.OPENAI_API_KEY].find(
    (credential) =>
      credential && !credential.startsWith('replace_with_') && !credential.startsWith('your_'),
  )

  if (!apiKey) {
    throw new Error(
      'Azure AI authentication is missing. Set AZURE_AI_ACCESS_TOKEN to a current bearer token or OPENAI_API_KEY to an Azure AI API key in your .env file.',
    )
  }

  return new OpenAI({ apiKey, baseURL })
}

function getOpenAiModel() {
  return process.env.OPENAI_MODEL || 'gpt-5'
}

function isCacheEnabled() {
  return process.env.AGENT_CACHE_ENABLED !== 'false'
}

function createCacheKey(prefix: string, payload: unknown) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        prefix,
        model: getOpenAiModel(),
        endpoint: process.env.OPENAI_BASE_URL ?? '',
        payload,
      }),
    )
    .digest('hex')
}

async function readCache<T>(stage: string, key: string): Promise<T | null> {
  if (!isCacheEnabled()) {
    return null
  }

  try {
    const cachePath = path.join(agentCacheDir, `${stage}-${key}.json`)
    const cached = JSON.parse(await fs.readFile(cachePath, 'utf8')) as {
      schemaVersion: number
      value: T
    }
    if (cached.schemaVersion === CACHE_SCHEMA_VERSION) {
      return cached.value
    }
  } catch {
    // Cache miss or read failure
  }

  return null
}

async function writeCache<T>(stage: string, key: string, value: T) {
  if (!isCacheEnabled()) {
    return
  }

  await fs.mkdir(agentCacheDir, { recursive: true })
  const cachePath = path.join(agentCacheDir, `${stage}-${key}.json`)
  const temporaryPath = `${cachePath}.${randomUUID()}.tmp`
  await fs.writeFile(
    temporaryPath,
    JSON.stringify({
      schemaVersion: CACHE_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      value,
    }),
  )
  await fs.rename(temporaryPath, cachePath)
}

function stripCodeFence(value: string) {
  return value.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
}

function parseJsonSafely<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(stripCodeFence(value)) as T
  } catch {
    return fallback
  }
}

function getResponseText(response: unknown): string {
  const candidate = response as {
    output_text?: string
    output?: Array<{ content?: Array<{ text?: string }> }>
  }

  if (typeof candidate.output_text === 'string' && candidate.output_text.trim()) {
    return candidate.output_text.trim()
  }

  const collected: string[] = []
  for (const item of candidate.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === 'string') {
        collected.push(content.text)
      }
    }
  }

  return collected.join('\n').trim()
}

export async function processManualAndReleaseNotesText(params: {
  client: OpenAI
  screenshotPath: string
  screenshotMime: string
  screenshotDescription: string
  userStoryText: string
  manualTemplateText?: string
  releaseNotesTemplateText?: string
  customFormatPrompt?: string
}): Promise<TextGenerationResult> {
  const {
    client,
    screenshotPath,
    screenshotMime,
    screenshotDescription,
    userStoryText,
    manualTemplateText = '',
    releaseNotesTemplateText = '',
    customFormatPrompt = '',
  } = params

  const screenshotBuffer = await fs.readFile(screenshotPath)
  const screenshotHash = createHash('sha256').update(screenshotBuffer).digest('hex')

  const cacheKey = createCacheKey('text-generation', {
    promptVersion: ANALYSIS_PROMPT_VERSION,
    screenshotHash,
    screenshotDescription: screenshotDescription.trim(),
    userStoryText: userStoryText.slice(0, 10000).trim(),
    manualTemplateText: manualTemplateText.slice(0, 8000).trim(),
    releaseNotesTemplateText: releaseNotesTemplateText.slice(0, 8000).trim(),
    customFormatPrompt: customFormatPrompt.trim(),
  })

  const cached = await readCache<TextGenerationResult>('text-generation', cacheKey)
  if (cached) {
    return cached
  }

  const screenshotBase64 = screenshotBuffer.toString('base64')

  const promptUserLines = [
    '=== USER STORY EXCEL WORKBOOK CONTENT ===',
    userStoryText.slice(0, 15000),
    '',
    '=== SCREENSHOT USER DESCRIPTION ===',
    screenshotDescription || 'No description provided.',
  ]

  if (manualTemplateText.trim()) {
    promptUserLines.push(
      '',
      '=== REFERENCE / TEMPLATE USER MANUAL EXCERPT (USE THIS HEADINGS & WRITING STYLE FORMAT) ===',
      manualTemplateText.slice(0, 10000),
    )
  }

  if (releaseNotesTemplateText.trim()) {
    promptUserLines.push(
      '',
      '=== REFERENCE / TEMPLATE RELEASE NOTES EXCERPT (USE THIS HEADINGS & WRITING STYLE FORMAT) ===',
      releaseNotesTemplateText.slice(0, 10000),
    )
  }

  if (customFormatPrompt.trim()) {
    promptUserLines.push(
      '',
      '=== USER CUSTOM INSTRUCTIONS & DESIRED HEADINGS/FORMAT ===',
      customFormatPrompt.trim(),
    )
  }

  promptUserLines.push(
    '',
    'Now, execute the analysis strictly following the system prompt and return the JSON response with keys: summary, visibleChanges, extractedText, impacts, userManualText, and releaseNotesText.',
  )

  const systemPrompt = `i want u to visually analyse the images and its description which is uploaded and go across the content inside the User Stories excel file uploaded and generate info acc to this way:   Your job is to thoroughly analyze the provided UI screenshot alongside the user description to identify EXACTLY what changed, where it appears in the workflow, and which screens, sections, buttons, fields, or tabs are affected. Return with keys: summary, visibleChanges, extractedText, impacts.

CRITICAL INSTRUCTIONS:
1. Carefully examine and cross-reference the user description with the screenshot visual elements.
2. In summary: State clearly what screen/feature is shown, what changed, and where it lives in the application flow.
3. In visibleChanges: List specific UI differences, new or modified buttons, input fields, labels, headers, toggles, or layout changes.
4. In extractedText: Extract exact literal text labels, titles, button captions, dropdown options, and heading texts visible in the changed area of the screenshot.
5. In impacts: Identify the specific user actions, workflow steps, or operational manual sections affected by this change.

generate this content as such that it should be updated, the reference manual and release notes if provided as input analyse that and generate in that particular format acc to the headings and other things. i dont want u to hallucinate any content, clearly visually understand the screeshot along with its desciption and then map them across the respected user stories and generate in the format for manul and release notes separately.

Format instructions:
Return strictly a valid JSON object with the following top-level keys:
{
  "summary": "Clear statement of screen/feature shown, what changed, and where it lives in the workflow",
  "visibleChanges": ["List of specific UI differences, buttons, fields, toggles, headers, layout changes"],
  "extractedText": ["Exact literal text labels, titles, button captions, dropdown options, and heading texts visible in screenshot"],
  "impacts": ["Specific user actions, workflow steps, or operational manual sections affected"],
  "userManualText": "The complete, ready-to-use user manual section text for this feature. Structure with headings, step-by-step procedures, field descriptions, and notes. If reference template manual or custom format was supplied, strictly follow its heading levels, structure, and tone. Do not hallucinate; reflect exact user story and screenshot elements.",
  "releaseNotesText": "The complete, ready-to-use release note text for this change. Include version/feature heading, overview, new capabilities, and user impacts. If reference release notes template was provided, strictly match its format."
}`

  const response = await client.responses.create({
    model: getOpenAiModel(),
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: systemPrompt,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: promptUserLines.join('\n'),
          },
          {
            type: 'input_image',
            image_url: `data:${screenshotMime};base64,${screenshotBase64}`,
          },
        ],
      },
    ],
  } as never)

  const rawJson = getResponseText(response)
  const parsed = parseJsonSafely<{
    summary?: string
    visibleChanges?: string[]
    extractedText?: string[]
    impacts?: string[]
    userManualText?: string
    releaseNotesText?: string
  }>(rawJson, {})

  const result: TextGenerationResult = {
    screenshotAnalysis: {
      summary: parsed.summary || 'Summary unavailable',
      visibleChanges: parsed.visibleChanges || [],
      extractedText: parsed.extractedText || [],
      impacts: parsed.impacts || [],
    },
    userManualText: parsed.userManualText || 'User manual text generation completed.',
    releaseNotesText: parsed.releaseNotesText || 'Release notes text generation completed.',
  }

  await writeCache('text-generation', cacheKey, result)
  return result
}
