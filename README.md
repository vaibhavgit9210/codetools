# CodeTools

A browser-based code formatter and diff checker. No backend, no build step -- pure HTML/CSS/JS with CDN-loaded dependencies.

**Live:** [vaibhavgit9210.github.io/codetools](https://vaibhavgit9210.github.io/codetools/)

## Features

### Format Mode
- Paste code, select a language, click **Format** (or `Ctrl/Cmd+Enter`)
- Supported languages: JavaScript, JSON, HTML, CSS, SQL, XML, Python
- SQL dialect selector: MySQL, PostgreSQL, PL/SQL, T-SQL, Spark SQL, MariaDB, Redshift
- Copy formatted output to clipboard with one click

### Diff Mode
- Paste original and modified code side by side
- Click **Compute Diff** to see changes highlighted
- Toggle between inline and side-by-side diff views
- Swap panels button to quickly flip inputs

### General
- Dark/light theme toggle (persisted across sessions)
- Responsive layout -- stacks on mobile, side-by-side on desktop
- Keyboard shortcut: `Ctrl/Cmd+Enter` to format or compute diff

## Tech Stack

All libraries loaded via CDN -- no npm install or build required.

| Library | Purpose |
|---------|---------|
| [CodeMirror 6](https://codemirror.net/) | Code editors with syntax highlighting |
| [js-beautify](https://github.com/beautifier/js-beautify) | Format JS, HTML, CSS, XML |
| [sql-formatter](https://github.com/sql-formatter-org/sql-formatter) | Format SQL dialects |
| [Prettier](https://prettier.io/) | Format JSON |
| [jsdiff](https://github.com/kpdecker/jsdiff) | Compute unified diffs |
| [diff2html](https://diff2html.xyz/) | Render GitHub-style diff output |

## File Structure

```
index.html      -- HTML shell, CDN scripts, CodeMirror import map
styles.css      -- Theming (light/dark), layout, responsive design
app.js          -- Main controller: editors, events, tab/theme switching
formatter.js    -- Language-specific formatting dispatchers
differ.js       -- Diff computation + rendering
```

## Running Locally

Just open `index.html` in a browser. For best results use a local server (needed for ES module imports):

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .
```

Then visit `http://localhost:8000`.

## Notes

- **Python formatting** is limited to basic cleanup (tabs to spaces, trailing whitespace removal) since no browser-native Python formatter exists
- **JSON formatting** uses Prettier when available, falls back to `JSON.parse` + `JSON.stringify`
