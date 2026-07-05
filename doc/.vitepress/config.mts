import { defineConfig } from "vitepress";

const siteUrl = "https://lithdoo.github.io/BindTTY/";
const siteTitle = "BindTTY 文档";
const siteDescription =
  "面向 MVVM + signal 的 TypeScript/TSX 终端 UI 框架";
const ogImage = `${siteUrl}favicon.png`;

export default defineConfig({
  base: "/BindTTY/",
  lang: "zh-CN",
  title: "BindTTY",
  description: siteDescription,
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
          { text: "ELEMENT_REF", link: "/specs/ELEMENT_REF" }
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
    editLink: {
      pattern:
        "https://github.com/lithdoo/BindTTY/edit/main/doc/:path",
      text: "在 GitHub 上编辑此页"
    },
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: "搜索文档",
                buttonAriaLabel: "搜索文档"
              },
              modal: {
                displayDetails: "显示详细列表",
                resetButtonTitle: "重置搜索",
                backButtonTitle: "关闭搜索",
                noResultsText: "未找到相关结果",
                footer: {
                  selectText: "选择",
                  selectKeyAriaLabel: "Enter",
                  navigateText: "切换",
                  navigateUpKeyAriaLabel: "上箭头",
                  navigateDownKeyAriaLabel: "下箭头",
                  closeText: "关闭",
                  closeKeyAriaLabel: "Esc"
                }
              }
            }
          }
        }
      }
    },
    docFooter: {
      prev: "上一页",
      next: "下一页"
    },
    outline: {
      label: "本页目录"
    },
    darkModeSwitchLabel: "外观",
    sidebarMenuLabel: "菜单",
    returnToTopLabel: "回到顶部",
    langMenuLabel: "语言",
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
  head: [
    ["link", { rel: "icon", href: "/BindTTY/favicon.ico", sizes: "any" }],
    ["link", { rel: "icon", type: "image/png", href: "/BindTTY/favicon.png" }],
    ["link", { rel: "apple-touch-icon", href: "/BindTTY/favicon.png" }],
    ["link", { rel: "canonical", href: siteUrl }],
    ["meta", { property: "og:site_name", content: siteTitle }],
    ["meta", { property: "og:title", content: siteTitle }],
    ["meta", { property: "og:description", content: siteDescription }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:url", content: siteUrl }],
    ["meta", { property: "og:image", content: ogImage }],
    ["meta", { property: "og:locale", content: "zh_CN" }],
    ["meta", { name: "twitter:card", content: "summary" }],
    ["meta", { name: "twitter:title", content: siteTitle }],
    ["meta", { name: "twitter:description", content: siteDescription }],
    ["meta", { name: "twitter:image", content: ogImage }]
  ]
});
