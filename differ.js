/**
 * Diff computation and rendering using jsdiff + diff2html.
 * Both libraries are loaded via CDN as globals (Diff, Diff2HtmlUI).
 */

/**
 * Compute and render a diff between two strings.
 * @param {string} original - Original text
 * @param {string} modified - Modified text
 * @param {object} options - { targetEl, viewMode, fileName, baseLabel, otherLabel }
 */
export function computeAndRenderDiff(original, modified, options = {}) {
  const {
    targetEl,
    viewMode = 'line-by-line',
    fileName = 'file',
    baseLabel,
    otherLabel,
  } = options;

  if (!targetEl) {
    throw new Error('Target element is required for diff rendering.');
  }

  // Clear previous output
  targetEl.innerHTML = '';

  // Check for identical content
  if (original === modified) {
    targetEl.innerHTML = '<div class="diff-no-changes">No differences found - both inputs are identical.</div>';
    return { identical: true };
  }

  // Check for empty inputs
  if (!original.trim() && !modified.trim()) {
    targetEl.innerHTML = '<div class="diff-no-changes">Both inputs are empty.</div>';
    return { identical: true };
  }

  // Ensure strings end with newline for clean diff output
  const origText = original.endsWith('\n') ? original : original + '\n';
  const modText = modified.endsWith('\n') ? modified : modified + '\n';

  // Generate unified diff using jsdiff
  if (typeof Diff === 'undefined') {
    throw new Error('jsdiff library is not loaded. Check your internet connection.');
  }

  const origHeader = baseLabel || `${fileName} (original)`;
  const modHeader = otherLabel || `${fileName} (modified)`;

  const unifiedDiff = Diff.createTwoFilesPatch(
    origHeader,
    modHeader,
    origText,
    modText,
    '',
    '',
    { context: 3 }
  );

  // Render with diff2html
  if (typeof Diff2HtmlUI === 'undefined') {
    throw new Error('diff2html library is not loaded. Check your internet connection.');
  }

  const configuration = {
    drawFileList: false,
    matching: 'lines',
    outputFormat: viewMode,
    highlight: true,
    colorScheme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
  };

  const diff2htmlUi = new Diff2HtmlUI(targetEl, unifiedDiff, configuration);
  diff2htmlUi.draw();

  return { identical: false };
}
