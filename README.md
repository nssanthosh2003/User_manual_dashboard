# User Manual Updation Dashboard (Text Generation Module)

A dedicated, lightweight application focused strictly on **text generation & analysis** without performing in-place document edits or DOCX export routines.

---

## Capabilities & Inputs

1. **Upload User Story File**: Excel workbook (`.xlsx`, `.xls`). Extracts all sheets and tables into structured context.
2. **Upload Screenshot**: UI change screenshot (`.png`, `.jpeg`, `.webp`).
3. **Screenshot Description**: Text box describing what changed in the screenshot and UI interactions.
4. **Separate Reference / Template Uploads (Optional Tabs)**:
   - **Template User Manual (`.docx`)**: Analyzed for tone, heading hierarchy, and instructional formatting.
   - **Template Release Notes (`.docx`)**: Analyzed for release note phrasing, highlights, and bullet structure.
5. **Prompt Description Box (Optional)**: Provide custom headings, section levels, or specific layout formats to guide the output generation.

---

## Output Section

Displays the generated text directly on the dashboard:
- **User Manual Section Content**: Ready-to-copy, non-hallucinated section text matching your template headings and style.
- **Release Notes Section Content**: Ready-to-copy release note summary matching your release notes template.
- **Visual Recognition & Impact Breakdown**:
  - `summary`: Clear statement of screen/feature, what changed, and where it lives in workflow.
  - `visibleChanges`: Specific UI differences, buttons, fields, toggles, headers, layout changes.
  - `extractedText`: Exact literal text labels, titles, button captions, dropdown options, and heading texts visible in screenshot.
  - `impacts`: Specific user actions, workflow steps, or operational manual sections affected.

---

## How to Run

1. Open PowerShell and navigate to this folder:
   ```powershell
   cd "C:\Users\Agentassist\Desktop\User_manual_agent\User manul updation dashboard"
   ```
2. Start the development server (runs backend on port 8788 and Vite on port 5174):
   ```powershell
   npm run dev
   ```
3. Open your browser at `http://localhost:5174`.
