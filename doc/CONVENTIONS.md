# BindTTY 文档规范

维护 BindTTY `doc/` 目录的命名、结构与生命周期规则。完整索引见 [README.md](./README.md)。

---

## 1. 目录结构

```text
doc/
├── README.md              # 唯一索引
├── CONVENTIONS.md         # 本文件
├── architecture/          # 总览与路线图
├── packages/              # 1 包 1 文
├── specs/                 # 横切现行规范（layout / renderer / intrinsic）
├── widgets/               # @bindtty/widgets 控件现行规范
├── testing/               # 测试规范
├── archive/               # 只读备份
│   └── plans/             # 已落地里程碑的完整计划
└── redirects/             # 旧路径 stub
```

**禁止**在 `doc/` 根目录新增平铺 `.md`（redirect 除外时放 `redirects/`）。

---

## 2. 命名规则

| 规则 | 说明 |
| --- | --- |
| 禁止里程碑前缀 | 已落地能力不得用 `M7_` 等命名活跃文档 |
| 目录即类型 | `packages/` = 包设计；`specs/` = 横切规范；`widgets/` = 控件规范；`archive/plans/` = 历史计划 |
| 文件名 = 主题 | 大写蛇形，不含「计划」「落地」 |
| plan 不进 specs/ | 计划全文只在 `archive/plans/`；spec 只写现行行为 |
| 每个 rename 必有 redirect | 旧路径 stub 放在 `redirects/` |

`@bindtty/signal` 无独立 doc：见 [architecture/DESIGN.md](./architecture/DESIGN.md) §20 与 [@bindtty/signal README](https://github.com/lithdoo/BindTTY/blob/main/packages/signal/README.md)。

---

## 3. 文档类型与强制章节

某节无内容时写「无」或合并到相邻节。**不得**在文末添加 `## M7 当前实现` 类平行附录；改在 §9（package）或链 `specs/` / `widgets/`。

### A. `packages/<PKG>.md`

```markdown
# @bindtty/<pkg> 落地设计   （APP.md：bindtty createApp）

> **类型**：package
> **范围**：@bindtty/<pkg>
> **状态**：implemented | partial
> **最后核对**：YYYY-MM
> **代码入口**：packages/<pkg>/src/index.ts
> **相关**：…

相关文档

## 1. 背景与目标
## 2. 包归属与依赖
## 3. 目录结构
## 4. 对外 API
## 5. 行为语义
## 6. 与其它模块的接口 contract
## 7. 错误处理
## 8. 测试策略
## 9. 当前结论
```

§4 必须与 `packages/<pkg>/src` 导出及 types **逐字段同步**。

### B. `specs/<TOPIC>.md`

```markdown
# <Topic 中文名>（English subtitle）

> **类型**：spec
> …

## 1. 范围（1.1 已支持 / 1.2 不在范围 / 1.3 术语）
## 2. 数据流
## 3–N. 分层现行行为
## 测试回归索引
## 已知限制
## 历史计划（仅链 archive/plans/）
```

控件 API **不**写入 `specs/`；见 `widgets/`。

### C. `architecture/*.md`

- **DESIGN.md**：视图树架构
- **ROADMAP.md**：里程碑与下一阶段；不重复 package API 细节

### D. `testing/E2E.md`

目标、包结构、场景索引、判断标准、相关 spec 链接。

### E. `archive/plans/*.md`

文首 blockquote：`类型: plan · 状态: archived · 现行规范: ../../specs/XXX.md`。正文完整保留。

### F. `widgets/<WIDGET>.md`

```markdown
# <Widget 中文名>（EnglishName）

> **类型**：widget
> **范围**：@bindtty/widgets
> **状态**：implemented | partial
> **最后核对**：YYYY-MM
> **代码入口**：packages/widgets/src/<group>/<file>.ts
> **相关**：[WIDGETS.md](../packages/WIDGETS.md) · …

## 1. 范围（1.1 已支持 / 1.2 不在范围 / 1.3 术语）
## 2. 数据流
## 3. 对外 API
## 4–N. 行为语义 / 布局 / 按键
## 测试回归索引
## 已知限制
```

功能相近的控件可合并为一文（如 `SCROLL.md` 覆盖 VScrollView / HScrollView / ScrollView / List）。引擎层 clip/scroll 契约仍写在 `specs/`。

---

## 4. 维护 checklist

改公开 API 时：

1. 更新 `packages/*.md` §4（包级摘要）
2. 更新相关 `doc/widgets/*.md` §API 与 §范围
3. 若涉及 layout / renderer 横切行为，更新 `specs/*.md`
4. 刷新 front-matter「最后核对」
5. 核对 `packages/<pkg>/test/` 与 doc 测试回归索引

里程碑完成时：

1. plan 全文移 `archive/plans/`
2. 从 plan 摘现行行为到 `specs/`
3. 从 [TODO.md](https://github.com/lithdoo/BindTTY/blob/main/TODO.md) 删除已完成项；阶段规划更新 [architecture/NEXT_STEPS.md](./architecture/NEXT_STEPS.md)

新横切能力：

1. 新建 `specs/<TOPIC>.md`
2. 在 [README.md](./README.md) 加一行
3. plan 细节直接进 `archive/plans/`

可发布包若生产代码 `import "@bindtty/signal"`，须在 `package.json` 声明 `peerDependencies` + 保留 `dependencies` 中的同版本 `@bindtty/signal`（见 `bindtty`、`@bindtty/widgets`）。`runtime` / `layout` 等仅测试使用 signal 的包只放 `devDependencies`。

---

## 5. 站点发布

Markdown 源码仍在 `doc/`；VitePress（`doc/.vitepress/config.mts`）仅负责构建静态站点，发布到 [https://lithdoo.github.io/BindTTY/](https://lithdoo.github.io/BindTTY/)。

| 规则 | 说明 |
| --- | --- |
| 站外链接 | 链到仓库根、`TODO.md`、`packages/*/README`、`.github/` 时使用 GitHub blob 绝对 URL，不用 `../` 相对路径 |
| Sidebar | 改文档索引时同步更新 `doc/.vitepress/config.mts` 的 `themeConfig.sidebar`（结构对齐 [README.md](./README.md)；导航与首页壳层使用中文，技术文件名/包名可保留英文） |
| 不上站 | `archive/`、`redirects/` 由 `srcExclude` / `rewrites` 处理，不直接出现在导航 |
| 生成文档 | `docs:build` 会先运行 `gen:layout-props`，保证 [LAYOUT_PROPS.md](./specs/LAYOUT_PROPS.md) 为最新 |
| 静态资源 | favicon 等放 `doc/public/`（构建时复制到站点根） |
