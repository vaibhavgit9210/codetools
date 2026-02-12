/**
 * Language-specific code formatting dispatchers.
 * All formatting libraries are loaded via CDN as globals.
 */

/**
 * Format code based on language selection.
 * @param {string} code - The input code to format
 * @param {string} language - Language identifier
 * @param {object} options - Additional options (e.g., sqlDialect)
 * @returns {Promise<string>} Formatted code
 */
export async function formatCode(code, language, options = {}) {
  if (!code.trim()) {
    throw new Error('No code to format. Please enter some code in the input editor.');
  }

  switch (language) {
    case 'javascript':
      return formatJavaScript(code);
    case 'json':
      return formatJSON(code);
    case 'html':
      return formatHTML(code);
    case 'css':
      return formatCSS(code);
    case 'sql':
      return formatSQL(code, options.sqlDialect || 'sql');
    case 'xml':
      return formatXML(code);
    case 'python':
      return formatPython(code);
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}

function getBeautify(name) {
  // js-beautify globals are objects with same-named methods: e.g. window.js_beautify.js_beautify
  const g = window[name];
  if (!g) return null;
  return typeof g === 'function' ? g : typeof g[name] === 'function' ? g[name] : null;
}

function formatJavaScript(code) {
  const beautify = getBeautify('js_beautify');
  if (!beautify) {
    throw new Error('JavaScript formatter (js-beautify) is not loaded. Check your internet connection.');
  }
  return beautify(code, {
    indent_size: 2,
    space_in_empty_paren: false,
    preserve_newlines: true,
    max_preserve_newlines: 2,
    end_with_newline: true,
  });
}

async function formatJSON(code) {
  // Try Prettier first
  if (typeof prettier !== 'undefined' && typeof prettierPlugins !== 'undefined') {
    try {
      return await prettier.format(code, {
        parser: 'json',
        plugins: prettierPlugins.babel ? [prettierPlugins.babel, prettierPlugins.estree] : Object.values(prettierPlugins),
        tabWidth: 2,
      });
    } catch (e) {
      // Fall through to JSON.stringify fallback
    }
  }

  // Fallback: JSON.parse + JSON.stringify
  try {
    const parsed = JSON.parse(code);
    return JSON.stringify(parsed, null, 2) + '\n';
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }
}

function formatHTML(code) {
  const beautify = getBeautify('html_beautify');
  if (!beautify) {
    throw new Error('HTML formatter (js-beautify) is not loaded. Check your internet connection.');
  }
  return beautify(code, {
    indent_size: 2,
    wrap_line_length: 120,
    preserve_newlines: true,
    max_preserve_newlines: 2,
    end_with_newline: true,
    indent_inner_html: true,
  });
}

function formatCSS(code) {
  const beautify = getBeautify('css_beautify');
  if (!beautify) {
    throw new Error('CSS formatter (js-beautify) is not loaded. Check your internet connection.');
  }
  return beautify(code, {
    indent_size: 2,
    end_with_newline: true,
    newline_between_rules: true,
  });
}

function formatSQL(code, dialect) {
  if (typeof sqlFormatter === 'undefined' || typeof sqlFormatter.format !== 'function') {
    throw new Error('SQL formatter is not loaded. Check your internet connection.');
  }

  // sql-formatter v4 supported languages
  const languageMap = {
    sql: 'sql',
    mysql: 'mysql',
    postgresql: 'postgresql',
    plsql: 'plsql',
    tsql: 'tsql',
    spark: 'spark',
    mariadb: 'mariadb',
    redshift: 'redshift',
  };

  return sqlFormatter.format(code, {
    language: languageMap[dialect] || 'sql',
    indent: '  ',
    uppercase: true,
    linesBetweenQueries: 2,
  });
}

function formatXML(code) {
  const beautify = getBeautify('html_beautify');
  if (!beautify) {
    throw new Error('XML formatter (js-beautify) is not loaded. Check your internet connection.');
  }
  return beautify(code, {
    indent_size: 2,
    wrap_line_length: 120,
    preserve_newlines: true,
    max_preserve_newlines: 2,
    end_with_newline: true,
    content_unformatted: [],
    unformatted: [],
  });
}

function formatPython(code) {
  // Basic cleanup: tabs to spaces, trailing whitespace, consistent newlines
  let result = code
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Convert tabs to 4 spaces
    .replace(/\t/g, '    ')
    // Remove trailing whitespace from each line
    .split('\n')
    .map(line => line.replace(/\s+$/, ''))
    .join('\n')
    // Remove excessive blank lines (more than 2 consecutive)
    .replace(/\n{4,}/g, '\n\n\n')
    // Ensure file ends with a single newline
    .replace(/\n*$/, '\n');

  return result;
}
