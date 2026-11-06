// A small, inert HTML parser for the public rank pages. The Workers runtime has no DOM, and the
// pages are only read, never rendered or executed: scripts become plain text nodes.
// Nodes follow the shape of parse5's default tree adapter, which the page reader was written for.

export interface HtmlAttribute {
  name: string;
  value: string;
}

export interface HtmlNode {
  nodeName: string;
  tagName?: string;
  attrs?: HtmlAttribute[];
  childNodes?: HtmlNode[];
  value?: string;
}

const voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
// Their content is never markup: script and style are kept verbatim, title and textarea decode entities.
const rawTextElements = new Set(['script', 'style']);
const escapableRawTextElements = new Set(['title', 'textarea']);

// Opening one of these closes an open element of the listed kinds, unless a boundary comes first.
const impliedEndTags: Record<string, { closes: string[]; boundaries: string[] }> = {
  td: { closes: ['td', 'th'], boundaries: ['tr', 'table'] },
  th: { closes: ['td', 'th'], boundaries: ['tr', 'table'] },
  tr: { closes: ['tr'], boundaries: ['table'] },
  li: { closes: ['li'], boundaries: ['ul', 'ol'] },
  option: { closes: ['option'], boundaries: ['select', 'datalist'] },
  p: { closes: ['p'], boundaries: ['table', 'td', 'th', 'button'] },
};

const namedEntities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, reference: string) => {
    if (!reference.startsWith('#')) return namedEntities[reference.toLowerCase()] ?? entity;
    const isHex = reference[1] === 'x' || reference[1] === 'X';
    const codePoint = Number.parseInt(reference.slice(isHex ? 2 : 1), isHex ? 16 : 10);
    const valid = codePoint > 0 && codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff);
    return valid ? String.fromCodePoint(codePoint) : '�';
  });
}

function element(tagName: string, attrs: HtmlAttribute[]): HtmlNode {
  return { nodeName: tagName, tagName, attrs, childNodes: [] };
}

function textNode(value: string): HtmlNode {
  return { nodeName: '#text', value };
}

interface StartTag {
  name: string;
  attrs: HtmlAttribute[];
  end: number;
}

// Reads `<name attr=value ...>` starting at `start` (the `<`). Returns null when it is not a tag.
function readStartTag(html: string, start: number): StartTag | null {
  const nameMatch = /^<([a-zA-Z][^\s/>]*)/.exec(html.slice(start, start + 256));
  if (!nameMatch?.[1]) return null;
  const attrs: HtmlAttribute[] = [];
  let index = start + nameMatch[0].length;
  while (index < html.length) {
    while (/\s/.test(html[index] ?? '')) index++;
    const character = html[index];
    if (character === undefined) break;
    if (character === '>') return { name: nameMatch[1].toLowerCase(), attrs, end: index + 1 };
    if (character === '/') {
      index++;
      continue;
    }
    const attributeName = /^[^\s/>=]+/.exec(html.slice(index))?.[0] ?? html[index] ?? '';
    index += attributeName.length;
    while (/\s/.test(html[index] ?? '')) index++;
    let value = '';
    if (html[index] === '=') {
      index++;
      while (/\s/.test(html[index] ?? '')) index++;
      const quote = html[index];
      if (quote === '"' || quote === "'") {
        const closing = html.indexOf(quote, index + 1);
        const valueEnd = closing < 0 ? html.length : closing;
        value = html.slice(index + 1, valueEnd);
        index = valueEnd + 1;
      } else {
        value = /^[^\s>]*/.exec(html.slice(index))?.[0] ?? '';
        index += value.length;
      }
    }
    const name = attributeName.toLowerCase();
    // Like browsers, the first occurrence of a duplicated attribute wins.
    if (!attrs.some((attribute) => attribute.name === name)) attrs.push({ name, value: decodeEntities(value) });
  }
  return { name: nameMatch[1].toLowerCase(), attrs, end: html.length };
}

export function parseHtml(html: string): HtmlNode {
  const documentNode: HtmlNode = { nodeName: '#document', childNodes: [] };
  const openElements: HtmlNode[] = [documentNode];
  const current = (): HtmlNode => openElements[openElements.length - 1] ?? documentNode;
  const append = (node: HtmlNode) => current().childNodes?.push(node);
  const popUntil = (index: number) => {
    openElements.length = Math.max(1, index);
  };
  const findOpen = (names: string[], boundaries: string[]): number => {
    for (let index = openElements.length - 1; index > 0; index--) {
      const tagName = openElements[index]?.tagName ?? '';
      if (names.includes(tagName)) return index;
      if (boundaries.includes(tagName)) return -1;
    }
    return -1;
  };

  let index = 0;
  while (index < html.length) {
    if (html.startsWith('<!--', index)) {
      const closing = html.indexOf('-->', index + 4);
      const end = closing < 0 ? html.length : closing;
      append({ nodeName: '#comment', value: html.slice(index + 4, end) });
      index = closing < 0 ? html.length : closing + 3;
      continue;
    }
    if (html.startsWith('<!', index) || html.startsWith('<?', index)) {
      const closing = html.indexOf('>', index);
      if (/^<!doctype/i.test(html.slice(index, index + 9))) append({ nodeName: '#documentType' });
      index = closing < 0 ? html.length : closing + 1;
      continue;
    }
    const endTag = /^<\/([a-zA-Z][^\s/>]*)[^>]*>?/.exec(html.slice(index, index + 256));
    if (endTag?.[1]) {
      const open = findOpen([endTag[1].toLowerCase()], []);
      if (open > 0) popUntil(open);
      index += endTag[0].length;
      continue;
    }
    const startTag = html[index] === '<' ? readStartTag(html, index) : null;
    if (startTag) {
      const implied = impliedEndTags[startTag.name];
      if (implied) {
        const open = findOpen(implied.closes, implied.boundaries);
        if (open > 0) popUntil(open);
      }
      const node = element(startTag.name, startTag.attrs);
      append(node);
      index = startTag.end;
      if (voidElements.has(startTag.name)) continue;
      if (rawTextElements.has(startTag.name) || escapableRawTextElements.has(startTag.name)) {
        const closing = html.slice(index).search(new RegExp(`</${startTag.name}[\\s/>]`, 'i'));
        const end = closing < 0 ? html.length : index + closing;
        const content = html.slice(index, end);
        if (content) {
          const decoded = escapableRawTextElements.has(startTag.name) ? decodeEntities(content) : content;
          node.childNodes?.push(textNode(decoded));
        }
        const tagEnd = html.indexOf('>', end);
        index = closing < 0 || tagEnd < 0 ? html.length : tagEnd + 1;
        continue;
      }
      openElements.push(node);
      continue;
    }
    // Text runs to the next character that can start markup; a lone `<` stays text.
    const next = html.indexOf('<', index + 1);
    const end = next < 0 ? html.length : next;
    const text = decodeEntities(html.slice(index, end));
    const previous = current().childNodes?.at(-1);
    if (previous?.nodeName === '#text') previous.value = (previous.value ?? '') + text;
    else append(textNode(text));
    index = end;
  }
  return documentNode;
}
