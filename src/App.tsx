import { useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type ScreenshotAnalysis = {
  summary: string
  visibleChanges: string[]
  extractedText: string[]
  impacts: string[]
}

type TextGenerationData = {
  screenshotAnalysis: ScreenshotAnalysis
  userManualText: string
  releaseNotesText: string
}

type ApiResponse = {
  success: boolean
  generatedAt: string
  userStoryFileName: string
  screenshotFileName: string
  templateManualFileName: string | null
  templateReleaseNotesFileName: string | null
  result: TextGenerationData
}

export default function App() {
  const [userStoryFile, setUserStoryFile] = useState<File | null>(null)
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [screenshotDescription, setScreenshotDescription] = useState('')
  const [templateManualFile, setTemplateManualFile] = useState<File | null>(null)
  const [templateReleaseNotesFile, setTemplateReleaseNotesFile] = useState<File | null>(null)
  const [customFormatPrompt, setCustomFormatPrompt] = useState('')

  const [activeOutputTab, setActiveOutputTab] = useState<'manual' | 'releasenotes' | 'analysis'>('manual')

  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [responseData, setResponseData] = useState<ApiResponse | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (!userStoryFile) {
      setErrorMessage('Please upload a User Story Excel file.')
      return
    }
    if (!screenshotFile) {
      setErrorMessage('Please upload a UI change screenshot.')
      return
    }

    const formData = new FormData()
    formData.append('userStory', userStoryFile)
    formData.append('screenshot', screenshotFile)
    formData.append('screenshotDescription', screenshotDescription)
    if (templateManualFile) {
      formData.append('templateManual', templateManualFile)
    }
    if (templateReleaseNotesFile) {
      formData.append('templateReleaseNotes', templateReleaseNotesFile)
    }
    if (customFormatPrompt.trim()) {
      formData.append('customFormatPrompt', customFormatPrompt)
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/generate-text', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate text content.')
      }

      setResponseData(data)
      setActiveOutputTab('manual')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An error occurred during generation.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="dashboard-header-text">
          <span className="header-tag">Text Generation Module</span>
          <h1>User Manual Updation Dashboard</h1>
          <p>
            Visually analyze UI screenshots, map them across User Story Excel workbooks, and generate
            ready-to-use User Manual and Release Notes section text formatted according to your templates.
          </p>
        </div>
      </header>

      {/* Main Form and Output Layout */}
      <div className="dashboard-grid">
        {/* Left Side: Uploads & Controls */}
        <section className="panel">
          <div className="panel-title">
            <h2>Inputs & Specifications</h2>
          </div>

          <form onSubmit={handleSubmit} className="form-section">
            {/* 1. Upload User Story File */}
            <div className="input-block">
              <label className="input-block-label">
                <span>Upload User Story File (Excel)</span>
                <span className="badge-required">Required</span>
              </label>
              <div className="input-file-container">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => setUserStoryFile(e.target.files?.[0] || null)}
                />
                <span className="input-hint">
                  {userStoryFile ? `Selected: ${userStoryFile.name}` : 'Select .xlsx or .xls file'}
                </span>
              </div>
            </div>

            {/* 2. Upload Screenshot */}
            <div className="input-block">
              <label className="input-block-label">
                <span>Upload Screenshot</span>
                <span className="badge-required">Required</span>
              </label>
              <div className="input-file-container">
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
                />
                <span className="input-hint">
                  {screenshotFile ? `Selected: ${screenshotFile.name}` : 'PNG, JPG, or WEBP image'}
                </span>
              </div>
            </div>

            {/* 3. Screenshot Description */}
            <div className="input-block">
              <label className="input-block-label">
                <span>Screenshot Description</span>
                <span className="badge-optional">Recommended</span>
              </label>
              <textarea
                className="text-input"
                placeholder="Describe what changed in the screenshot, new controls, button labels, screen context, or actions..."
                value={screenshotDescription}
                onChange={(e) => setScreenshotDescription(e.target.value)}
                rows={3}
              />
              <span className="input-hint">Helps ground visual recognition with explicit intent.</span>
            </div>

            {/* 4. BOTH Template User Manual & Template Release Notes (Side-by-side or stacked upload) */}
            <div className="optional-tabs-box">
              <div className="input-block-label">
                <span>Reference / Template Documents</span>
                <span className="badge-optional">Both Optional</span>
              </div>

              {/* Template User Manual */}
              <div className="template-upload-item">
                <label className="template-label">
                  <span>Template User Manual (.docx)</span>
                  {templateManualFile && (
                    <button
                      type="button"
                      className="btn-clear"
                      onClick={() => setTemplateManualFile(null)}
                      title="Clear file"
                    >
                      Clear
                    </button>
                  )}
                </label>
                <div className="input-file-container">
                  <input
                    type="file"
                    accept=".docx"
                    onChange={(e) => setTemplateManualFile(e.target.files?.[0] || null)}
                  />
                  <span className="input-hint">
                    {templateManualFile
                      ? `Selected: ${templateManualFile.name}`
                      : 'Upload manual Word document to mirror its heading and instructional layout'}
                  </span>
                </div>
              </div>

              {/* Template Release Notes */}
              <div className="template-upload-item">
                <label className="template-label">
                  <span>Template Release Notes (.docx)</span>
                  {templateReleaseNotesFile && (
                    <button
                      type="button"
                      className="btn-clear"
                      onClick={() => setTemplateReleaseNotesFile(null)}
                      title="Clear file"
                    >
                      Clear
                    </button>
                  )}
                </label>
                <div className="input-file-container">
                  <input
                    type="file"
                    accept=".docx"
                    onChange={(e) => setTemplateReleaseNotesFile(e.target.files?.[0] || null)}
                  />
                  <span className="input-hint">
                    {templateReleaseNotesFile
                      ? `Selected: ${templateReleaseNotesFile.name}`
                      : 'Upload release notes Word document to mirror its bullet and highlight structure'}
                  </span>
                </div>
              </div>
            </div>

            {/* 5. Prompt Description Box (Optional) */}
            <div className="input-block">
              <label className="input-block-label">
                <span>Prompt / Headings Format Description</span>
                <span className="badge-optional">Optional</span>
              </label>
              <textarea
                className="text-input"
                placeholder="Specify desired headings, outline levels, section hierarchy, or formatting guidelines..."
                value={customFormatPrompt}
                onChange={(e) => setCustomFormatPrompt(e.target.value)}
                rows={3}
              />
              <span className="input-hint">
                Provide custom section headings or instructions to guide how the text is organized.
              </span>
            </div>

            {errorMessage && <div className="error-message">{errorMessage}</div>}

            <button type="submit" className="btn-submit" disabled={isLoading}>
              {isLoading ? 'Analyzing & Generating Text...' : 'Generate Formatted Text'}
            </button>
          </form>
        </section>

        {/* Right Side: Output Text Section */}
        <section className="panel">
          <div className="panel-title">
            <h2>Generated Output Text</h2>
            {responseData && (
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Generated at {new Date(responseData.generatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          {responseData ? (
            <div>
              {/* Output Tabs */}
              <div className="output-tabs">
                <button
                  type="button"
                  className={`output-tab-button ${activeOutputTab === 'manual' ? 'active' : ''}`}
                  onClick={() => setActiveOutputTab('manual')}
                >
                  User Manual Text
                </button>
                <button
                  type="button"
                  className={`output-tab-button ${activeOutputTab === 'releasenotes' ? 'active' : ''}`}
                  onClick={() => setActiveOutputTab('releasenotes')}
                >
                  Release Notes Text
                </button>
                <button
                  type="button"
                  className={`output-tab-button ${activeOutputTab === 'analysis' ? 'active' : ''}`}
                  onClick={() => setActiveOutputTab('analysis')}
                >
                  Visual Analysis Breakdown
                </button>
              </div>

              {/* Tab 1: User Manual Text */}
              {activeOutputTab === 'manual' && (
                <div className="output-text-card">
                  <div className="output-card-header">
                    <h3>User Manual Section Content</h3>
                    <button
                      type="button"
                      className="btn-copy"
                      onClick={() => handleCopy(responseData.result.userManualText, 'manual')}
                    >
                      {copiedKey === 'manual' ? 'Copied!' : 'Copy Manual Text'}
                    </button>
                  </div>
                  <div className="formatted-output-view">
                    {responseData.result.userManualText}
                  </div>
                </div>
              )}

              {/* Tab 2: Release Notes Text */}
              {activeOutputTab === 'releasenotes' && (
                <div className="output-text-card">
                  <div className="output-card-header">
                    <h3>Release Notes Section Content</h3>
                    <button
                      type="button"
                      className="btn-copy"
                      onClick={() => handleCopy(responseData.result.releaseNotesText, 'releasenotes')}
                    >
                      {copiedKey === 'releasenotes' ? 'Copied!' : 'Copy Release Notes'}
                    </button>
                  </div>
                  <div className="formatted-output-view">
                    {responseData.result.releaseNotesText}
                  </div>
                </div>
              )}

              {/* Tab 3: Screenshot Analysis Breakdown */}
              {activeOutputTab === 'analysis' && (
                <div className="output-text-card">
                  <div className="output-card-header">
                    <h3>Visual Recognition & Impact Breakdown</h3>
                  </div>
                  <div className="analysis-grid">
                    <div className="analysis-subcard" style={{ gridColumn: '1 / -1' }}>
                      <h4>Summary & Workflow Context</h4>
                      <p style={{ fontSize: '0.92rem', color: '#1e293b' }}>
                        {responseData.result.screenshotAnalysis.summary}
                      </p>
                    </div>

                    <div className="analysis-subcard">
                      <h4>Visible UI Changes</h4>
                      <ul>
                        {responseData.result.screenshotAnalysis.visibleChanges.map((change, i) => (
                          <li key={i}>{change}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="analysis-subcard">
                      <h4>Extracted Text & Elements</h4>
                      <ul>
                        {responseData.result.screenshotAnalysis.extractedText.map((txt, i) => (
                          <li key={i}>{txt}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="analysis-subcard" style={{ gridColumn: '1 / -1' }}>
                      <h4>Impacts & Affected Sections</h4>
                      <ul>
                        {responseData.result.screenshotAnalysis.impacts.map((imp, i) => (
                          <li key={i}>{imp}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-output-placeholder">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3>Ready to Generate Text</h3>
              <p>
                Upload your User Story Excel file, UI screenshot, and any optional reference templates or heading prompts on the left, then click <strong>Generate Formatted Text</strong>.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
