import { defineConfig } from "vitepress";

const repoBase = "https://github.com/lithdoo/BindTTY/blob/main";

export default defineConfig({
  base: "/BindTTY/",
  title: "BindTTY",
  description: "MVVM signal-driven TUI framework for TypeScript/TSX",
  srcExclude: ["archive/**", "redirects/**"],
  rewrites: {
    "redirects/TEXT_INPUT.md": "widgets/TEXT_INPUT.md",
    "redirects/PROGRESS_BAR.md": "widgets/PROGRESS_BAR.md",
    "redirects/M7_SCROLL_VIEWPORT.md": "specs/SCROLL_VIEWPORT.md",
    "redirects/E2E_TESTING.md": "testing/E2E.md",
    "redirects/TUI_IMPLEMENTATION_PLAN.md": "architecture/ROADMAP.md",
    "redirects/NODE_SETUP.md": "specs/ELEMENT_REF.md",
    "redirects/YOGA_LAYOUT.md": "specs/YOGA_AND_TEXT.md",
    "redirects/WIDE_TEXT_FRAME.md": "specs/DISPLAY_WIDTH.md"
  },
  themeConfig: {
    nav: [
      { text: "Guide", link: "/" },
      { text: "Index", link: "/README" },
      { text: "GitHub", link: "https://github.com/lithdoo/BindTTY" },
      { text: "npm", link: "https://www.npmjs.com/package/bindtty" }
    ],
    sidebar: [
      {
        text: "开始",
        items: [
          { text: "Getting Started", link: "/" },
          { text: "文档索引", link: "/README" },
          { text: "维护规范", link: "/CONVENTIONS" }
        ]
      },
      {
        text: "Architecture",
        items: [
          { text: "DESIGN", link: "/architecture/DESIGN" },
          { text: "ROADMAP", link: "/architecture/ROADMAP" },
          { text: "NEXT_STEPS", link: "/architecture/NEXT_STEPS" }
        ]
      },
      {
        text: "Packages",
        items: [
          { text: "VNODE", link: "/packages/VNODE" },
          { text: "JSX_RUNTIME", link: "/packages/JSX_RUNTIME" },
          { text: "RUNTIME", link: "/packages/RUNTIME" },
          { text: "LAYOUT", link: "/packages/LAYOUT" },
          { text: "RENDERER", link: "/packages/RENDERER" },
          { text: "TERMINAL", link: "/packages/TERMINAL" },
          { text: "INTERACTION", link: "/packages/INTERACTION" },
          { text: "WIDGETS", link: "/packages/WIDGETS" },
          { text: "APP (bindtty)", link: "/packages/APP" }
        ]
      },
      {
        text: "Specs",
        items: [
          { text: "DISPLAY_WIDTH", link: "/specs/DISPLAY_WIDTH" },
          { text: "SCROLL_VIEWPORT", link: "/specs/SCROLL_VIEWPORT" },
          { text: "YOGA_AND_TEXT", link: "/specs/YOGA_AND_TEXT" },
          { text: "LAYOUT_PROPS", link: "/specs/LAYOUT_PROPS" },
          { text: "ELEMENT_REF", link: "/specs/ELEMENT_REF" },
          { text: "TEXT_INPUT (stub)", link: "/specs/TEXT_INPUT" },
          { text: "PROGRESS_BAR (stub)", link: "/specs/PROGRESS_BAR" }
        ]
      },
      {
        text: "Widgets",
        items: [
          { text: "Overview", link: "/widgets/README" },
          { text: "BUTTON", link: "/widgets/BUTTON" },
          { text: "CHECKBOX", link: "/widgets/CHECKBOX" },
          { text: "SELECT", link: "/widgets/SELECT" },
          { text: "TEXT_INPUT", link: "/widgets/TEXT_INPUT" },
          { text: "PROGRESS_BAR", link: "/widgets/PROGRESS_BAR" },
          { text: "SCROLL", link: "/widgets/SCROLL" }
        ]
      },
      {
        text: "Testing",
        items: [{ text: "E2E", link: "/testing/E2E" }]
      }
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/lithdoo/BindTTY" }],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © BindTTY contributors"
    },
    externalLinkIcon: true
  },
  markdown: {
    lineNumbers: true
  },
  head: [["link", { rel: "icon", href: "/BindTTY/favicon.ico" }]],
  transformPageData(pageData) {
    pageData.frontmatter.editLink =
      `${repoBase}/doc/${pageData.relativePath}`;
  }
});
