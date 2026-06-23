/**
 * Site Guide: File Upload Dropzone
 * Per-site guide for drag-and-drop file upload zones found on file sharing,
 * cloud storage, and productivity sites.
 *
 * File upload dropzones accept files via two mechanisms:
 * 1. HTML5 DragEvent -- the dropzone listens for drag/drop events with files
 *    in the DataTransfer object (Dropzone.js, react-dropzone, native handlers)
 * 2. Hidden input[type=file] -- clicking the dropzone triggers a hidden file
 *    input element (browse dialog fallback)
 *
 * The primary challenge is that content scripts cannot open the native file
 * picker dialog (security restriction). Instead, we create a synthetic File
 * in a DataTransfer and dispatch DragEvent on the dropzone element.
 *
 * Two interaction strategies:
 * A. drop_file tool (preferred) -- synthetic File + DragEvent dispatch
 * B. Programmatic input.files assignment (fallback) -- set files on hidden input
 *
 * Created for Phase 64, MICRO-08 edge case validation.
 * Target: trigger file upload via browser dropzone simulation.
 */

registerSiteGuide({
  site: 'File Upload Dropzone',
  category: 'Utilities',
  patterns: [
    /dropzonejs\.com/i,
    /file\.io/i,
    /wetransfer\.com/i,
    /drive\.google\.com/i,
    /dropbox\.com/i,
    /sendgb\.com/i,
    /transfernow\.net/i,
    /uploadfiles\.io/i,
    /gofile\.io/i,
    /catbox\.moe/i
  ],
  guidance: `AUTOPILOT STRATEGY HINTS (from v0.9.7 diagnostic MICRO-08):
- [micro] Use drop_file tool with most specific selector (#id preferred over class)
- [micro] Dropzone elements may be JS-rendered (SPA) -- wait_for_stable before scanning
- [micro] Check input[type=file] accept attribute to match mimeType before dropping
- [micro] Verify file acceptance via DOM snapshot: file name visible, progress bar, .dz-success
- [micro] Fallback: click dropzone to trigger file input, though native picker blocks automation

FILE UPLOAD DROPZONE INTELLIGENCE:

DROPZONE ANATOMY:
- A file upload dropzone is an area on the page where users can drag and drop
  files from their desktop to upload them.
- Common implementations:
  1. Dropzone.js -- adds .dropzone or .dz-clickable class to the drop area
  2. react-dropzone -- renders a div with onDrop/onDragOver handlers
  3. Native HTML5 -- any element with dragover/drop event listeners
  4. Click-to-browse -- dropzone click triggers a hidden input[type=file]
- Visual indicators: dashed border, "Drag files here" text, upload icon,
  cloud icon, plus icon
- Active state: dropzone changes appearance when files are dragged over it
  (border color change, background highlight, "Drop files here" text)
- After drop: shows file name, upload progress bar, file size, preview thumbnail

INTERACTION STRATEGY 0 -- UPLOAD_FILE TOOL (PREFERRED WHEN YOU HAVE A DISK PATH):
The upload_file MCP tool sets a REAL file from a local disk path directly on the
target <input type="file"> via the browser DevTools protocol (DOM.setFileInputFiles).
Use this whenever the file already exists on disk -- it handles real binaries
(images, PDFs, documents) that drop_file's synthetic string content cannot. Steps:
1. Use get_dom_snapshot to find the <input type="file"> (or the dropzone/label
   that wraps a hidden one) and record its CSS selector.
2. Call upload_file(selector="input[type=file]", file_path="/absolute/path/to/file").
   The selector may be the input itself OR a container holding one; the path must be
   ABSOLUTE (relative or ~ paths are rejected). A sensitive-path denylist blocks
   secrets (keys, .env, ~/.ssh, the FSB vault) and every upload is audit-logged.
3. Use get_dom_snapshot to verify the file name / preview / progress appeared.
Only fall back to drop_file (Strategy A) for pure drag-only dropzones with no
underlying file input, or when you only have synthetic/inline content (no real file).

INTERACTION STRATEGY A -- DROP_FILE TOOL (synthetic content / dropzones):
The drop_file MCP tool creates a synthetic File object and dispatches the
HTML5 DragEvent sequence directly on the dropzone element. Steps:
1. Use get_dom_snapshot to identify the dropzone element.
   Look for: .dropzone, .dz-clickable, [class*="dropzone"], [class*="drop-zone"],
   [class*="upload-area"], [class*="drag-drop"], [class*="file-drop"],
   div with "drag" or "drop" in text content, elements with dashed borders
2. Use drop_file tool with the dropzone CSS selector:
   drop_file(selector=".dropzone", fileName="test-document.txt",
   fileContent="Test content for upload verification", mimeType="text/plain")
3. Wait briefly for the dropzone to process the file.
4. Use get_dom_snapshot to verify the file was accepted:
   - File name appears in the dropzone area
   - Upload progress bar visible
   - File size displayed
   - Preview thumbnail shown (for images)
   - Success checkmark or "Upload complete" text
5. If the file was NOT accepted (no visual change), try Strategy B.

INTERACTION STRATEGY B -- HIDDEN INPUT FALLBACK:
If the drop_file tool does not trigger the upload (some dropzone libraries
intercept and re-dispatch events internally), try the hidden input approach:
1. Use get_dom_snapshot to find input[type="file"] elements near the dropzone.
   They are often hidden (display:none, visibility:hidden, opacity:0,
   position:absolute with negative offsets, or zero dimensions).
2. The hidden input may have accept="image/*" or accept=".pdf,.doc" attributes
   that restrict file types.
3. Content scripts CANNOT programmatically open the file picker dialog or set a
   file input's value (browser security restriction). But the upload_file tool
   CAN: it runs in the background via the DevTools protocol (DOM.setFileInputFiles),
   which is exactly how it bypasses this restriction.
4. If you have the file on disk, use upload_file(selector, file_path) (Strategy 0).
   Only document a tool gap if there is no <input type="file"> at all (a pure
   drag-only dropzone).

DROPZONE.JS SPECIFIC PATTERNS:
- Container: .dropzone, form.dropzone, div.dropzone
- Clickable area: .dz-clickable
- Message area: .dz-message, .dz-default
- File preview: .dz-preview, .dz-file-preview, .dz-image-preview
- Progress: .dz-progress, .dz-upload
- Success: .dz-success
- Error: .dz-error, .dz-error-message
- Hidden input: .dz-hidden-input (hidden file input created by Dropzone.js)
- Drop event: Dropzone.js listens on the container for native drop events
  and reads dataTransfer.files

REACT-DROPZONE PATTERNS:
- Container: div with role="presentation" or role="button"
- Input: input[type="file"] with display:none or similar hiding
- Active class: often toggled when isDragActive is true
- Drop handler: onDrop callback processes the accepted files
- Accepts DataTransfer files from native drop events

NATIVE HTML5 PATTERNS:
- Any element with addEventListener('drop', handler)
- Must also have addEventListener('dragover', handler) with preventDefault()
- Often styled with dashed border and upload text/icon

IDENTIFYING DROPZONE ELEMENTS:
- Class names: dropzone, drop-zone, upload-area, drag-drop, file-drop,
  upload-zone, dz-clickable, file-upload-area
- Text content: "Drag", "Drop", "Upload", "Browse", "Choose file",
  "Drag and drop", "Drag files here"
- Visual: dashed or dotted border (border-style: dashed), large clickable area
- Hidden input: input[type="file"] inside or near the dropzone container
- Aria: role="button" with upload-related aria-label

FILE TYPE CONSIDERATIONS:
- For testing, use text/plain files -- they work universally
- For image upload sites, use mimeType="image/png" with any content
  (the content will be a text string but MIME type signals image intent)
- For document upload, use mimeType="application/pdf"
- The fileContent parameter is the raw string content of the file
- File size = fileContent.length bytes

VERIFICATION AFTER DROP:
- File name appears in the dropzone or adjacent area
- Upload progress indicator appears (progress bar, percentage, spinner)
- File thumbnail or icon displayed
- "Upload complete" or success message
- The dropzone state changed from "empty/ready" to "has file"
- Check both the dropzone element and its parent/siblings for these indicators

STUCK RECOVERY:
- If drop_file returns success but no visual change: the dropzone library may
  require the drop event to have specific properties. Try clicking the dropzone
  element first (to activate it) then retry drop_file.
- If no dropzone element found: look for input[type="file"] with a styled label.
  The label IS the visible "dropzone" but the actual file handling is on the input.
- If dropzone shows error: check accepted file types (accept attribute on hidden
  input) and adjust fileName/mimeType accordingly.
- If the site requires authentication: document as SKIP-AUTH.
- If the upload requires a real file (not synthetic): use the upload_file tool
  with an absolute disk path (Strategy 0) -- it sets the file via the background
  DevTools protocol (DOM.setFileInputFiles), bypassing the content-script
  filesystem restriction.`,
  selectors: {
    // Generic dropzone selectors
    dropzone: '.dropzone, [class*="dropzone"], [class*="drop-zone"], [class*="upload-area"], [class*="drag-drop"], [class*="file-drop"], [class*="upload-zone"]',
    dropzoneClickable: '.dz-clickable, [class*="dropzone"] [role="button"], [class*="upload"] [role="button"]',
    dropzoneMessage: '.dz-message, .dz-default, [class*="upload-message"], [class*="drop-message"], [class*="drag-text"]',
    fileInput: 'input[type="file"], .dz-hidden-input',
    filePreview: '.dz-preview, .dz-file-preview, .dz-image-preview, [class*="file-preview"], [class*="upload-preview"]',
    uploadProgress: '.dz-progress, .dz-upload, [class*="upload-progress"], [class*="progress-bar"], progress',
    uploadSuccess: '.dz-success, [class*="upload-success"], [class*="upload-complete"]',
    uploadError: '.dz-error, .dz-error-message, [class*="upload-error"], [class*="upload-fail"]',
    // Dropzone.js specific
    dzContainer: 'form.dropzone, div.dropzone, .dropzone',
    dzHiddenInput: '.dz-hidden-input',
    dzPreview: '.dz-preview',
    dzProgress: '.dz-progress .dz-upload',
    dzSuccess: '.dz-success',
    dzError: '.dz-error-message'
  },
  workflows: {
    simulateFileUpload: [
      'Navigate to a site with a file upload dropzone (e.g., dropzonejs.com or any file upload service). Dismiss any cookie/consent popups via click if present.',
      'Use get_dom_snapshot to map the page elements. Identify the dropzone element -- look for elements with classes containing "dropzone", "drop-zone", "upload-area", "drag-drop", "file-drop", or text like "Drag files here", "Drop files", "Upload". Also look for input[type="file"] elements (may be hidden). Record the CSS selector of the dropzone element.',
      'STRATEGY A -- DROP_FILE: Use the drop_file tool on the dropzone CSS selector with a test file. Example: drop_file(selector=".dropzone", fileName="test-document.txt", fileContent="FSB test upload content", mimeType="text/plain"). The tool creates a synthetic File and dispatches DragEvent sequence (dragenter, dragover, drop) on the target.',
      'WAIT briefly for the dropzone to process the file. The natural MCP tool chain latency usually covers this.',
      'Use get_dom_snapshot AGAIN to verify the file was accepted. Look for: the file name appearing in the dropzone area, an upload progress bar, a file preview thumbnail, a success indicator, or any visual change in the dropzone state.',
      'If Strategy A SUCCEEDED (file name visible, progress shown, or upload confirmed): REPORT SUCCESS. Document the dropzone selector used and verification method.',
      'If Strategy A FAILED (no visual change after drop_file): Try clicking the dropzone element to activate it, then retry drop_file. Some dropzone libraries require a prior interaction to initialize event listeners.',
      'If the retry also fails: Look for a hidden input[type="file"] element near the dropzone. If you have a real file on disk, use upload_file(selector, file_path) (Strategy 0) -- it sets the file directly via DOM.setFileInputFiles. Only note a tool gap if there is no file input at all (a pure drag-only dropzone).',
      'REPORT: Document which strategy was used (A or B), whether the file was accepted, and whether upload progress or file name was displayed.'
    ]
  },
  toolPreferences: ['navigate', 'read_page', 'get_dom_snapshot', 'upload_file', 'drop_file', 'click', 'wait_for_element', 'wait_for_stable']
});
