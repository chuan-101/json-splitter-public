import React from "react";
import SafeMarkdown from "../../src/components/SafeMarkdown.jsx";

export default function ReactMarkdown({ children }) {
  const content = typeof children === "string" ? children : String(children ?? "");
  return React.createElement(SafeMarkdown, { content });
}
