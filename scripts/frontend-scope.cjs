const { parse } = require('acorn');
const { createHash } = require('node:crypto');

function bindingIdentifiers(pattern) {
  if (!pattern) return [];
  switch (pattern.type) {
    case 'Identifier': return [pattern];
    case 'RestElement': return bindingIdentifiers(pattern.argument);
    case 'AssignmentPattern': return bindingIdentifiers(pattern.left);
    case 'ArrayPattern': return pattern.elements.flatMap(bindingIdentifiers);
    case 'ObjectPattern': return pattern.properties.flatMap(property =>
      bindingIdentifiers(property.type === 'RestElement' ? property.argument : property.value));
    default: return [];
  }
}

function findTopLevelDeclarations(source) {
  const program = parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  const declarations = [];
  for (const node of program.body) {
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
      declarations.push({
        type: node.type === 'FunctionDeclaration' ? 'function' : 'class',
        name: node.id.name,
        line: node.id.loc.start.line,
        source: source.slice(node.start, node.end)
      });
    } else if (node.type === 'VariableDeclaration') {
      for (const declaration of node.declarations) {
        const isFunction = declaration.id.type === 'Identifier' &&
          ['FunctionExpression', 'ArrowFunctionExpression'].includes(declaration.init?.type);
        for (const id of bindingIdentifiers(declaration.id)) {
          declarations.push({
            type: isFunction && node.kind === 'var' ? 'function' : node.kind,
            name: id.name, line: id.loc.start.line,
            ...(isFunction ? { source: source.slice(declaration.start, declaration.end) } : {})
          });
        }
      }
    }
  }
  return declarations;
}

function extractClassicScripts(html, htmlFile) {
  const scripts = [];
  const attributes = attrs => Object.fromEntries(Array.from(
    attrs.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g),
    match => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4]]
  ));
  let index = 0;
  for (const match of html.matchAll(/<!--[\s\S]*?-->|<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (match[1] === undefined) continue; // HTML comments cannot load scripts.
    index++;
    const attrs = attributes(match[1]);
    const type = (attrs.type || '').trim().toLowerCase();
    if (type && !['text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript'].includes(type)) continue;
    if (attrs.src !== undefined) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(attrs.src)) continue;
      scripts.push({ file: attrs.src.split(/[?#]/)[0], external: true, lineOffset: 0 });
    } else {
      const contentStart = match.index + match[0].indexOf('>') + 1;
      scripts.push({
        file: `${htmlFile} (inline script ${index})`,
        content: match[2], external: false,
        lineOffset: html.slice(0, contentStart).split('\n').length - 1
      });
    }
  }
  return scripts;
}

function findScopeCollisions(scripts) {
  const declared = new Map();
  const collisions = [];
  for (const script of scripts) {
    for (const declaration of findTopLevelDeclarations(script.content)) {
      const current = { ...declaration, file: script.file, line: declaration.line + (script.lineOffset || 0) };
      const previous = declared.get(current.name);
      // Shared var state is deliberately rebound by the existing browser modules.
      if (previous && !(previous.type === 'var' && current.type === 'var')) {
        collisions.push({ name: current.name, previous, current });
      }
      declared.set(current.name, current);
    }
  }
  return collisions;
}

function declarationFingerprint(declaration) {
  return {
    file: declaration.file,
    sha256: createHash('sha256').update(declaration.source).digest('hex')
  };
}

function isKnownCollision(collision, entry) {
  if (collision.previous.type !== 'function' || collision.current.type !== 'function') return false;
  return collision.name === entry.name &&
    ['previous', 'current'].every(side => {
      const fingerprint = declarationFingerprint(collision[side]);
      return fingerprint.file === entry[side].file && fingerprint.sha256 === entry[side].sha256;
    });
}

module.exports = { extractClassicScripts, findTopLevelDeclarations, findScopeCollisions, declarationFingerprint, isKnownCollision };
