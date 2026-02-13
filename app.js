/**
 * Main controller: creates CodeMirror editors, wires up events,
 * handles tab/theme switching, keyboard shortcuts.
 */

import { EditorView, keymap, lineNumbers, highlightActiveLineGutter,
         highlightSpecialChars, drawSelection, dropCursor,
         rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput,
         bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';

import { formatCode } from './formatter.js';
import { computeAndRenderDiff } from './differ.js';

// ===== Basic setup (built from individual extensions) =====
const basicSetup = [
  lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(),
  history(), foldGutter(), drawSelection(), dropCursor(),
  EditorState.allowMultipleSelections.of(true), indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(), closeBrackets(), autocompletion(),
  rectangularSelection(), crosshairCursor(), highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap,
    ...historyKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap,
  ]),
];

// ===== Language map =====
const languageExtensions = {
  javascript: () => javascript(),
  json: () => json(),
  html: () => html(),
  css: () => css(),
  sql: () => sql(),
  xml: () => xml(),
  python: () => python(),
};

// ===== Editor creation =====
const editors = {};

function createEditor(mountId, { readOnly = false, language = 'json' } = {}) {
  const langCompartment = new Compartment();
  const themeCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const langExt = languageExtensions[language] ? languageExtensions[language]() : [];

  const extensions = [
    ...basicSetup,
    langCompartment.of(langExt),
    themeCompartment.of(isDark ? oneDark : []),
    readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
    EditorView.lineWrapping,
  ];

  const parent = document.getElementById(mountId);
  const view = new EditorView({
    state: EditorState.create({ doc: '', extensions }),
    parent,
  });

  return { view, langCompartment, themeCompartment, readOnlyCompartment };
}

function initEditors() {
  editors.formatInput = createEditor('format-input-editor', { language: 'json' });
  editors.formatOutput = createEditor('format-output-editor', { readOnly: true, language: 'json' });
  editors.diffA = createEditor('diff-editor-a', { language: 'json' });
  editors.diffB = createEditor('diff-editor-b', { language: 'json' });
  editors.diffC = createEditor('diff-editor-c', { language: 'json' });
}

// ===== Diff state =====
const diffState = { primary: 'A' };

function getDiffEditor(key) {
  return editors[`diff${key}`];
}

function getDiffEditorTitle(key) {
  const input = document.querySelector(`.editor-title-input[data-editor="${key}"]`);
  return (input && input.value.trim()) || `Editor ${key}`;
}

function setDiffPrimary(key) {
  diffState.primary = key;
  // Update radio buttons
  const radio = document.querySelector(`.primary-radio[value="${key}"]`);
  if (radio) radio.checked = true;
  // Update is-primary class on panes
  ['A', 'B', 'C'].forEach(k => {
    const pane = document.getElementById(`diff-pane-${k.toLowerCase()}`);
    if (pane) pane.classList.toggle('is-primary', k === key);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Editor helpers =====
function getEditorContent(editor) {
  return editor.view.state.doc.toString();
}

function setEditorContent(editor, content) {
  editor.view.dispatch({
    changes: { from: 0, to: editor.view.state.doc.length, insert: content },
  });
}

function updateEditorLanguage(editor, language) {
  const langExt = languageExtensions[language] ? languageExtensions[language]() : [];
  editor.view.dispatch({
    effects: editor.langCompartment.reconfigure(langExt),
  });
}

function updateEditorTheme(editor, isDark) {
  editor.view.dispatch({
    effects: editor.themeCompartment.reconfigure(isDark ? oneDark : []),
  });
}

// ===== Status bar =====
let statusTimeout = null;

function showStatus(message, type = 'success') {
  const bar = document.getElementById('status-bar');
  bar.textContent = message;
  bar.className = `status-bar visible ${type}`;

  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    bar.className = 'status-bar';
  }, 3000);
}

// ===== Theme management =====
function getTheme() {
  return localStorage.getItem('codetools-theme') || 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('codetools-theme', theme);

  const isDark = theme === 'dark';
  Object.values(editors).forEach(editor => updateEditorTheme(editor, isDark));
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}

// ===== Tab switching =====
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `${tab}-panel`);
  });
}

// ===== Format action =====
async function handleFormat() {
  const language = document.getElementById('format-language').value;
  const code = getEditorContent(editors.formatInput);
  const sqlDialect = document.getElementById('sql-dialect').value;

  try {
    const formatted = await formatCode(code, language, { sqlDialect });
    setEditorContent(editors.formatOutput, formatted);
    showStatus(`Formatted ${language.toUpperCase()} successfully`, 'success');
  } catch (err) {
    showStatus(err.message, 'error');
  }
}

// ===== Diff action =====
async function handleDiff() {
  const baseKey = diffState.primary;
  const viewMode = document.getElementById('diff-view-mode').value;
  const language = document.getElementById('diff-language').value;
  const container = document.getElementById('diff-output-container');

  // Clear previous output
  container.innerHTML = '';

  // Identify editors with content
  const allKeys = ['A', 'B', 'C'];
  const keysWithContent = allKeys.filter(k => getEditorContent(getDiffEditor(k)).trim());
  const otherKeys = allKeys.filter(k => k !== baseKey);
  const othersWithContent = otherKeys.filter(k => getEditorContent(getDiffEditor(k)).trim());

  if (!getEditorContent(getDiffEditor(baseKey)).trim() && othersWithContent.length === 0) {
    showStatus('Enter content in at least two editors', 'error');
    return;
  }

  if (!getEditorContent(getDiffEditor(baseKey)).trim()) {
    showStatus('Base editor is empty', 'error');
    return;
  }

  if (othersWithContent.length === 0) {
    showStatus('Enter content in at least one other editor', 'error');
    return;
  }

  try {
    // Format all editors that have content, then update their contents
    for (const key of keysWithContent) {
      const raw = getEditorContent(getDiffEditor(key));
      try {
        const formatted = await formatCode(raw, language);
        setEditorContent(getDiffEditor(key), formatted);
      } catch {
        // If formatting fails (e.g. invalid syntax), keep the raw content
      }
    }

    // Now compute diffs using the (formatted) content
    const baseContent = getEditorContent(getDiffEditor(baseKey));
    const baseTitle = getDiffEditorTitle(baseKey);
    let allIdentical = true;

    for (const otherKey of othersWithContent) {
      const otherContent = getEditorContent(getDiffEditor(otherKey));
      const otherTitle = getDiffEditorTitle(otherKey);

      // Create diff result wrapper
      const resultEl = document.createElement('div');
      resultEl.className = 'diff-result';

      const headerEl = document.createElement('div');
      headerEl.className = 'diff-result-header';
      headerEl.innerHTML = `<span class="base-name">${escapeHtml(baseTitle)}</span> vs ${escapeHtml(otherTitle)}`;
      resultEl.appendChild(headerEl);

      const bodyEl = document.createElement('div');
      bodyEl.className = 'diff-result-body';
      resultEl.appendChild(bodyEl);

      container.appendChild(resultEl);

      const result = computeAndRenderDiff(baseContent, otherContent, {
        targetEl: bodyEl,
        viewMode,
        fileName: `file.${language}`,
        baseLabel: baseTitle,
        otherLabel: otherTitle,
      });

      if (!result.identical) allIdentical = false;
    }

    if (allIdentical) {
      showStatus('No differences found', 'success');
    } else {
      showStatus(`Diff computed — ${othersWithContent.length} comparison${othersWithContent.length > 1 ? 's' : ''}`, 'success');
    }
  } catch (err) {
    showStatus(err.message, 'error');
  }
}

// ===== Copy to clipboard =====
async function handleCopy() {
  const content = getEditorContent(editors.formatOutput);
  if (!content.trim()) {
    showStatus('Nothing to copy - output is empty', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(content);
    showStatus('Copied to clipboard', 'success');
  } catch (err) {
    showStatus('Failed to copy to clipboard', 'error');
  }
}

// ===== Cycle diff panels (A→B→C→A) =====
function handleCycle() {
  const keys = ['A', 'B', 'C'];
  const contents = keys.map(k => getEditorContent(getDiffEditor(k)));
  const titles = keys.map(k => {
    const input = document.querySelector(`.editor-title-input[data-editor="${k}"]`);
    return input ? input.value : '';
  });

  // Rotate: A gets C's content, B gets A's, C gets B's
  setEditorContent(getDiffEditor('A'), contents[2]);
  setEditorContent(getDiffEditor('B'), contents[0]);
  setEditorContent(getDiffEditor('C'), contents[1]);

  const titleInputs = keys.map(k => document.querySelector(`.editor-title-input[data-editor="${k}"]`));
  if (titleInputs[0]) titleInputs[0].value = titles[2];
  if (titleInputs[1]) titleInputs[1].value = titles[0];
  if (titleInputs[2]) titleInputs[2].value = titles[1];

  showStatus('Contents cycled A→B→C→A', 'success');
}

// ===== Clear editors =====
function handleFormatClear() {
  setEditorContent(editors.formatInput, '');
  setEditorContent(editors.formatOutput, '');
  showStatus('Editors cleared', 'success');
}

function handleDiffClear() {
  ['A', 'B', 'C'].forEach(k => {
    setEditorContent(getDiffEditor(k), '');
    const input = document.querySelector(`.editor-title-input[data-editor="${k}"]`);
    if (input) input.value = '';
  });
  document.getElementById('diff-output-container').innerHTML = '';
  setDiffPrimary('A');
  showStatus('Editors cleared', 'success');
}

// ===== Event wiring =====
function setupEvents() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Format panel
  document.getElementById('format-btn').addEventListener('click', handleFormat);
  document.getElementById('format-copy-btn').addEventListener('click', handleCopy);
  document.getElementById('format-clear-btn').addEventListener('click', handleFormatClear);

  // Format language change
  document.getElementById('format-language').addEventListener('change', (e) => {
    const lang = e.target.value;
    updateEditorLanguage(editors.formatInput, lang);
    updateEditorLanguage(editors.formatOutput, lang);

    // Show/hide SQL dialect selector
    document.getElementById('sql-dialect-group').style.display =
      lang === 'sql' ? 'flex' : 'none';
  });

  // Diff panel
  document.getElementById('diff-btn').addEventListener('click', handleDiff);
  document.getElementById('diff-cycle-btn').addEventListener('click', handleCycle);
  document.getElementById('diff-clear-btn').addEventListener('click', handleDiffClear);

  // Primary radio buttons
  document.querySelectorAll('.primary-radio').forEach(radio => {
    radio.addEventListener('change', (e) => {
      setDiffPrimary(e.target.value);
    });
  });

  // Diff language change
  document.getElementById('diff-language').addEventListener('change', (e) => {
    const lang = e.target.value;
    ['A', 'B', 'C'].forEach(k => updateEditorLanguage(getDiffEditor(k), lang));
  });

  // Keyboard shortcut: Ctrl/Cmd+Enter
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
      if (activeTab === 'format') {
        handleFormat();
      } else if (activeTab === 'diff') {
        handleDiff();
      }
    }
  });
}

// ===== Initialize =====
function init() {
  // Apply saved theme
  const savedTheme = getTheme();
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Create editors
  initEditors();

  // Set initial primary editor
  setDiffPrimary('A');

  // Wire events
  setupEvents();

  // Apply theme to editors (in case saved theme is dark)
  if (savedTheme === 'dark') {
    Object.values(editors).forEach(editor => updateEditorTheme(editor, true));
  }
}

init();
