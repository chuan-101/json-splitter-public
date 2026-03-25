import React from "react";

const INLINE_PATTERNS = [
  { type: "code", regex: /`([^`]+)`/g },
  { type: "link", regex: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g },
  { type: "bold", regex: /\*\*([^*]+)\*\*/g },
  { type: "italic", regex: /\*([^*]+)\*/g },
];

function parseInline(text, keyPrefix) {
  const source = text ?? "";
  let nodes = [source];

  INLINE_PATTERNS.forEach(({ type, regex }) => {
    nodes = nodes.flatMap((node, nodeIdx) => {
      if (typeof node !== "string") return [node];
      const parts = [];
      let last = 0;
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(node)) !== null) {
        if (match.index > last) parts.push(node.slice(last, match.index));
        const key = `${keyPrefix}-${type}-${nodeIdx}-${match.index}`;
        if (type === "code") parts.push(<code key={key}>{match[1]}</code>);
        if (type === "link") parts.push(<a key={key} href={match[2]} target="_blank" rel="noreferrer">{match[1]}</a>);
        if (type === "bold") parts.push(<strong key={key}>{match[1]}</strong>);
        if (type === "italic") parts.push(<em key={key}>{match[1]}</em>);
        last = regex.lastIndex;
      }
      if (last < node.length) parts.push(node.slice(last));
      return parts.length ? parts : [node];
    });
  });

  return nodes;
}

export default function SafeMarkdown({ content }) {
  const lines = String(content ?? "").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const codeStart = line.match(/^```\s*(\w+)?\s*$/);
    if (codeStart) {
      const lang = codeStart[1] || "";
      const code = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(
        <pre key={`code-${i}`}>
          <code className={lang ? `language-${lang}` : undefined}>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const Tag = `h${level}`;
      blocks.push(<Tag key={`h-${i}`}>{parseInline(heading[2], `h-${i}`)}</Tag>);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(<blockquote key={`q-${i}`}>{parseInline(quote.join("\n"), `q-${i}`)}</blockquote>);
      continue;
    }

    if (/^\s*([-*])\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(<ul key={`ul-${i}`}>{items.map((item, idx) => <li key={idx}>{parseInline(item, `ul-${i}-${idx}`)}</li>)}</ul>);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(<ol key={`ol-${i}`}>{items.map((item, idx) => <li key={idx}>{parseInline(item, `ol-${i}-${idx}`)}</li>)}</ol>);
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s+/.test(lines[i]) && !/^```/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(<p key={`p-${i}`}>{parseInline(para.join("\n"), `p-${i}`)}</p>);
  }

  return <>{blocks}</>;
}
