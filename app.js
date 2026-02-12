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
  editors.diffOriginal = createEditor('diff-original-editor', { language: 'json' });
  editors.diffModified = createEditor('diff-modified-editor', { language: 'json' });
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
function handleDiff() {
  const original = getEditorContent(editors.diffOriginal);
  const modified = getEditorContent(editors.diffModified);
  const viewMode = document.getElementById('diff-view-mode').value;
  const language = document.getElementById('diff-language').value;
  const targetEl = document.getElementById('diff-output');

  try {
    const result = computeAndRenderDiff(original, modified, {
      targetEl,
      viewMode,
      fileName: `file.${language}`,
    });

    if (result.identical) {
      showStatus('No differences found', 'success');
    } else {
      showStatus('Diff computed successfully', 'success');
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

// ===== Swap diff panels =====
function handleSwap() {
  const original = getEditorContent(editors.diffOriginal);
  const modified = getEditorContent(editors.diffModified);
  setEditorContent(editors.diffOriginal, modified);
  setEditorContent(editors.diffModified, original);
  showStatus('Panels swapped', 'success');
}

// ===== Clear editors =====
function handleFormatClear() {
  setEditorContent(editors.formatInput, '');
  setEditorContent(editors.formatOutput, '');
  showStatus('Editors cleared', 'success');
}

function handleDiffClear() {
  setEditorContent(editors.diffOriginal, '');
  setEditorContent(editors.diffModified, '');
  document.getElementById('diff-output').innerHTML = '';
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
  document.getElementById('diff-swap-btn').addEventListener('click', handleSwap);
  document.getElementById('diff-clear-btn').addEventListener('click', handleDiffClear);

  // Diff language change
  document.getElementById('diff-language').addEventListener('change', (e) => {
    const lang = e.target.value;
    updateEditorLanguage(editors.diffOriginal, lang);
    updateEditorLanguage(editors.diffModified, lang);
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

  // Wire events
  setupEvents();

  // Apply theme to editors (in case saved theme is dark)
  if (savedTheme === 'dark') {
    Object.values(editors).forEach(editor => updateEditorTheme(editor, true));
  }
}

init();
