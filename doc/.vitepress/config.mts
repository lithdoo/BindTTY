import { defineConfig } from "vitepress";

const repoBase = "https://github.com/lithdoo/BindTTY/blob/main";

export default defineConfig({
  base: "/BindTTY/",
  title: "BindTTY",
  description: "面向 MVVM + signal 的 TypeScript/TSX 终端 UI 框架",
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
      { text: "指南", link: "/" },
      { text: "文档索引", link: "/README" },
      { text: "GitHub", link: "https://github.com/lithdoo/BindTTY" },
      { text: "npm", link: "https://www.npmjs.com/package/bindtty" }
    ],
    sidebar: [
      {
        text: "开始",
        items: [
          { text: "快速开始", link: "/" },
          { text: "文档索引", link: "/README" },
          { text: "维护规范", link: "/CONVENTIONS" }
        ]
      },
      {
        text: "架构",
        items: [
          { text: "DESIGN · 视图树设计", link: "/architecture/DESIGN" },
          { text: "ROADMAP · 里程碑", link: "/architecture/ROADMAP" },
          { text: "NEXT_STEPS · Alpha 规划", link: "/architecture/NEXT_STEPS" }
        ]
      },
      {
        text: "包设计",
        items: [
          { text: "VNODE", link: "/packages/VNODE" },
          { text: "JSX_RUNTIME", link: "/packages/JSX_RUNTIME" },
          { text: "RUNTIME", link: "/packages/RUNTIME" },
          { text: "LAYOUT", link: "/packages/LAYOUT" },
          { text: "RENDERER", link: "/packages/RENDERER" },
          { text: "TERMINAL", link: "/packages/TERMINAL" },
          { text: "INTERACTION", link: "/packages/INTERACTION" },
          { text: "WIDGETS", link: "/packages/WIDGETS" },
          { text: "APP · bindtty", link: "/packages/APP" }
        ]
      },
      {
        text: "规范",
        items: [
          { text: "DISPLAY_WIDTH · 宽字符", link: "/specs/DISPLAY_WIDTH" },
          { text: "SCROLL_VIEWPORT · 滚动", link: "/specs/SCROLL_VIEWPORT" },
          { text: "YOGA_AND_TEXT", link: "/specs/YOGA_AND_TEXT" },
          { text: "LAYOUT_PROPS · 属性矩阵", link: "/specs/LAYOUT_PROPS" },
          { text: "ELEMENT_REF", link: "/specs/ELEMENT_REF" },
          { text: "TEXT_INPUT（跳转）", link: "/specs/TEXT_INPUT" },
          { text: "PROGRESS_BAR（跳转）", link: "/specs/PROGRESS_BAR" }
        ]
      },
      {
        text: "控件",
        items: [
          { text: "概览", link: "/widgets/README" },
          { text: "BUTTON", link: "/widgets/BUTTON" },
          { text: "CHECKBOX", link: "/widgets/CHECKBOX" },
          { text: "SELECT", link: "/widgets/SELECT" },
          { text: "TEXT_INPUT", link: "/widgets/TEXT_INPUT" },
          { text: "PROGRESS_BAR", link: "/widgets/PROGRESS_BAR" },
          { text: "SCROLL", link: "/widgets/SCROLL" }
        ]
      },
      {
        text: "测试",
        items: [{ text: "E2E", link: "/testing/E2E" }]
      }
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/lithdoo/BindTTY" }],
    footer: {
      message: "MIT 许可证发布",
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
