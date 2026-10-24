/**
 * Semantic token registry: the machine-readable mirror of src/css/tokens.css.
 * Programs that need token names (theming UIs, tests, docs generators) use
 * these constants instead of string literals.
 */

export const DEFAULT_THEME = "obsidian-gold" as const;

export type ThemeName = typeof DEFAULT_THEME | (string & {});

export interface TokenGroup {
  group: string;
  tokens: string[];
}

export const TOKEN_GROUPS: TokenGroup[] = [
  {
    group: "color.background",
    tokens: ["--si-bg-canvas", "--si-bg-surface", "--si-bg-raised", "--si-bg-highlight"],
  },
  {
    group: "color.text",
    tokens: [
      "--si-text-primary",
      "--si-text-secondary",
      "--si-text-muted",
      "--si-text-faint",
      "--si-text-bright",
    ],
  },
  {
    group: "color.accent",
    tokens: [
      "--si-accent-primary",
      "--si-accent-strong",
      "--si-accent-dim",
      "--si-accent-wash",
      "--si-accent-wash-strong",
      "--si-accent-secondary",
      "--si-accent-secondary-dim",
    ],
  },
  {
    group: "color.border",
    tokens: ["--si-border", "--si-border-strong", "--si-border-accent"],
  },
  {
    group: "color.status",
    tokens: ["--si-status-success", "--si-status-warning", "--si-status-danger", "--si-status-info"],
  },
  {
    group: "color.graph",
    tokens: [
      "--si-graph-node",
      "--si-graph-node-accent",
      "--si-graph-node-dim",
      "--si-graph-edge",
      "--si-graph-edge-active",
      "--si-graph-selected",
      "--si-graph-label",
    ],
  },
  {
    group: "color.code",
    tokens: [
      "--si-code-bg",
      "--si-code-border",
      "--si-code-text",
      "--si-code-comment",
      "--si-code-keyword",
      "--si-code-string",
      "--si-code-function",
      "--si-code-variable",
      "--si-code-type",
      "--si-code-constant",
      "--si-code-number",
    ],
  },
  {
    group: "color.terminal",
    tokens: [
      "--si-terminal-bg",
      "--si-terminal-border",
      "--si-terminal-text",
      "--si-terminal-prompt",
      "--si-terminal-header",
    ],
  },
  {
    group: "typography",
    tokens: [
      "--si-font-mono",
      "--si-font-sans",
      "--si-font-serif",
      "--si-text-size-base",
      "--si-leading-body",
      "--si-leading-tight",
    ],
  },
  {
    group: "spacing",
    tokens: [
      "--si-space-1",
      "--si-space-2",
      "--si-space-3",
      "--si-space-4",
      "--si-space-5",
      "--si-space-6",
      "--si-space-7",
      "--si-space-8",
    ],
  },
  {
    group: "geometry",
    tokens: [
      "--si-radius-sm",
      "--si-radius-md",
      "--si-radius-lg",
      "--si-topbar-height",
      "--si-maxw",
    ],
  },
  {
    group: "shadow",
    tokens: ["--si-shadow-panel", "--si-shadow-pop", "--si-glow-accent"],
  },
  {
    group: "motion",
    tokens: ["--si-ease", "--si-fast", "--si-slow", "--si-focus", "--si-focus-offset"],
  },
];

export const ALL_TOKENS: string[] = TOKEN_GROUPS.flatMap((g) => g.tokens);
