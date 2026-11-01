import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import mammoth from 'mammoth'
import multer from 'multer'
import XLSX from 'xlsx'
import { processManualAndReleaseNotesText, requireClient } from './agent-workflow.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT ?? 8788)
const storageDir = path.join(process.cwd(), 'storage')
const uploadsDir = path.join(storageDir, 'uploads')

const upload = multer({ dest: uploadsDir })

app.use(cors())
app.use(express.json({ limit: '20mb' }))

async function ensureStorage() {
  await fs.mkdir(uploadsDir, { recursive: true })
}

async function extractFileText(filePath: string, originalName: string): Promise<string> {
  const extension = path.extname(originalName).toLowerCase()

  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value.trim()
  }

  if (extension === '.xlsx' || extension === '.xls') {
    const workbook = XLSX.readFile(filePath)
    const sheetsAsText = workbook.SheetNames.map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
        header: 1,
        blankrows: false,
        raw: false,
      })

      const rowText = rows
        .map((row) => row.map((cell) => String(cell ?? '').trim()).filter(Boolean).join(' | '))
        .filter(Boolean)
        .join('\n')

      return rowText ? `Sheet: ${sheetName}\n${rowText}` : ''
    })
      .filter(Boolean)
      .join('\n\n')

    return sheetsAsText.trim()
  }

  const raw = await fs.readFile(filePath, 'utf8')
  return raw.trim()
}

async function cleanupFiles(filePaths: string[]) {
  await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        await fs.unlink(filePath)
      } catch {
        // Ignore unlinking errors
      }
    }),
  )
}

app.post(
  '/api/generate-text',
  upload.fields([
    { name: 'userStory', maxCount: 1 },
    { name: 'screenshot', maxCount: 1 },
    { name: 'templateManual', maxCount: 1 },
    { name: 'templateReleaseNotes', maxCount: 1 },
  ]),
  async (request, response, next) => {
    const files = request.files as
      | {
          userStory?: Express.Multer.File[]
          screenshot?: Express.Multer.File[]
          templateManual?: Express.Multer.File[]
          templateReleaseNotes?: Express.Multer.File[]
        }
      | undefined

    const userStoryFile = files?.userStory?.[0]
    const screenshotFile = files?.screenshot?.[0]
    const templateManualFile = files?.templateManual?.[0]
    const templateReleaseNotesFile = files?.templateReleaseNotes?.[0]

    const screenshotDescription = String(request.body.screenshotDescription ?? '').trim()
    const customFormatPrompt = String(request.body.customFormatPrompt ?? '').trim()

    const tempFilePathsToClean: string[] = []
    if (userStoryFile) tempFilePathsToClean.push(userStoryFile.path)
    if (screenshotFile) tempFilePathsToClean.push(screenshotFile.path)
    if (templateManualFile) tempFilePathsToClean.push(templateManualFile.path)
    if (templateReleaseNotesFile) tempFilePathsToClean.push(templateReleaseNotesFile.path)

    if (!userStoryFile) {
      await cleanupFiles(tempFilePathsToClean)
      response.status(400).json({ error: 'Please upload a User Story file (Excel format).' })
      return
    }

    if (!screenshotFile) {
      await cleanupFiles(tempFilePathsToClean)
      response.status(400).json({ error: 'Please upload a UI screenshot image.' })
      return
    }

    try {
      const client = requireClient()

      // Extract User Story Excel text
      const userStoryText = await extractFileText(userStoryFile.path, userStoryFile.originalname)

      // Extract optional template user manual text
      let manualTemplateText = ''
      if (templateManualFile) {
        manualTemplateText = await extractFileText(
          templateManualFile.path,
          templateManualFile.originalname,
        )
      }

      // Extract optional template release notes text
      let releaseNotesTemplateText = ''
      if (templateReleaseNotesFile) {
        releaseNotesTemplateText = await extractFileText(
          templateReleaseNotesFile.path,
          templateReleaseNotesFile.originalname,
        )
      }

      // Process vision and generate formatted text
      const result = await processManualAndReleaseNotesText({
        client,
        screenshotPath: screenshotFile.path,
        screenshotMime: screenshotFile.mimetype,
        screenshotDescription,
        userStoryText,
        manualTemplateText,
        releaseNotesTemplateText,
        customFormatPrompt,
      })

      await cleanupFiles(tempFilePathsToClean)

      response.json({
        success: true,
        generatedAt: new Date().toISOString(),
        userStoryFileName: userStoryFile.originalname,
        screenshotFileName: screenshotFile.originalname,
        templateManualFileName: templateManualFile?.originalname || null,
        templateReleaseNotesFileName: templateReleaseNotesFile?.originalname || null,
        result,
      })
    } catch (error) {
      await cleanupFiles(tempFilePathsToClean)
      next(error)
    }
  },
)

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', error)
  const message = error instanceof Error ? error.message : 'Internal Server Error'
  res.status(500).json({ error: message })
})

async function start() {
  await ensureStorage()
  app.listen(port, () => {
    console.log(`User Manual Updation Dashboard server running on port ${port}`)
  })
}

start().catch(console.error)
