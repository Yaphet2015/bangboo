# Bangboo 插件配置兼容层设计

## 目标

让通过 `bangboo install` 安装的 Pi-compatible 插件在 Bangboo 进程及其子进程中读取 Bangboo 的用户级和项目级配置目录，而不是回退到 `~/.pi/agent` 或 `.pi/`；首次安装时，对仍然写死 `.pi` 路径、无法被运行时兼容层覆盖的插件给出非阻塞提醒。

## 根因

Bangboo 已将自身配置目录改为 `~/.bangboo/agent` 和 `.bangboo/`，并保留 Pi 扩展 ABI，但部分插件不只使用 runtime 导出的 `CONFIG_DIR_NAME`：

- 插件可能读取 `PI_CODING_AGENT_DIR`。
- 插件可能通过 `@earendil-works/pi-coding-agent` 的包名和 `piConfig.configDir` 探测宿主。
- 插件可能通过被探测包的 `bin` 字段启动子代理。
- 插件也可能直接写死 `.pi`，完全绕过可重定向接口。

当前 `pi-subagents` 同时使用这些机制。由于 Bangboo npm 包名是 `bangboo`，其严格的上游包名检查失败后会回退到 `.pi`；子代理 CLI 解析也可能回退到 PATH 中另一份 `pi`。

## 架构

### 启动环境兼容

Bangboo 在加载 CLI 和任何插件前计算有效的 agent/session 目录，并将其写入 Pi 兼容环境变量：

- `PI_CODING_AGENT_DIR` 指向 `BANGBOO_CODING_AGENT_DIR` 的有效值，未配置时指向 `~/.bangboo/agent`。
- `PI_CODING_AGENT_SESSION_DIR` 指向 `BANGBOO_CODING_AGENT_SESSION_DIR` 的有效值，未配置时使用 Bangboo 的默认 session 目录。

Bangboo 值必须覆盖进程中已有的 Pi 同名变量，不能因用户环境残留而读取 `.pi`。路径展开规则必须与 Bangboo 自身配置解析一致。

### 私有 compatibility facade

Bangboo 包内提供一个不对用户暴露为独立产品的上游兼容入口。该 facade：

- 元数据包名为 `@earendil-works/pi-coding-agent`。
- `piConfig.configDir` 为 `.bangboo`。
- 模块导出全部转发到当前 Bangboo runtime。
- `bin.pi` 指向当前包内的 Bangboo CLI。

extension loader 将当前和历史 Pi coding-agent import 名称解析到 facade。插件仍使用原有 ABI，但 `import.meta.resolve()`、包根目录扫描和 manifest 读取都会得到 Bangboo 的配置目录与 CLI。

Bangboo 还把 facade 根目录写入通用 package-root 兼容变量，并为当前 `pi-subagents` 使用其已有的 `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` 入口。该操作只发生在 Bangboo 运行时，不修改 `pi-subagents` 文件。

### 插件子进程

通过兼容 import 解析到 coding-agent package root 的插件，应从 facade 的 `bin.pi` 得到当前 Bangboo CLI。子进程继承已重定向的 Pi 兼容环境变量，因此用户配置、项目配置和 session 继续位于 Bangboo 目录，不会切换到另一份 Pi 安装。

## 首次安装兼容性扫描

### 执行时机

扫描只在 `bangboo install` 成功安装并写入 settings 后执行。`bangboo update`、`update --extensions`、`update --all` 和单包更新都不扫描。用户 remove 后重新 install 会再次扫描；不新增扫描历史文件或 settings 字段。

### 扫描范围

扫描本次安装的 package 根目录；本地单文件扩展只扫描该文件。候选源码扩展名包括：

- `.ts`、`.tsx`、`.mts`、`.cts`
- `.js`、`.jsx`、`.mjs`、`.cjs`
- `.sh`、`.py`

排除：

- 嵌套 `node_modules`
- `.git`
- tests/test、docs/doc、fixtures、examples 等非运行时目录
- source map、README、CHANGELOG 和其他文档
- 生成缓存目录

扫描器识别作为完整路径段出现的 `.pi`、`~/.pi`、Windows 分隔符形式，以及 `homedir()` 与 `".pi"` 等明显路径拼接。它不能把 `.pi-subagents` 当成 `.pi`，也不能因插件读取受支持的 `PI_CODING_AGENT_DIR` 而报警。

### 输出

命中时安装仍成功。Bangboo 输出一组兼容性 warning，其中包含：

- 安装源或插件名
- 命中总数
- 最多前 5 个 `文件:行号`
- 短 excerpt
- 建议插件改用 runtime `CONFIG_DIR_NAME`、配置 API 或 `PI_CODING_AGENT_DIR`

扫描不输出完整文件内容，不修改插件，不阻止插件加载。没有命中时保持静默。

## 错误处理

- 安装失败时保持原行为，不运行扫描。
- 单个候选文件在扫描过程中消失时跳过该文件并继续。
- package 根目录无法遍历或扫描整体无法完成时，安装仍成功，并输出一次简短的“兼容性扫描未完成”警告。
- compatibility facade 或环境映射不能回退读取 `.pi`；配置隔离优先于兼容旧 Pi 数据。
- 完全写死 `.pi` 且没有环境变量、runtime import 或元数据探测入口的插件，只能收到提醒；本功能不会声称已修复它。

## 数据隔离

本设计不创建 `.pi` 到 `.bangboo` 的符号链接，不读取、复制、迁移或修改 `.pi` 数据，也不改写第三方插件。现有 README 中“Bangboo never falls back to Pi configuration”的承诺保持为单一事实来源。

## 测试

自动化覆盖：

1. 默认和自定义 Bangboo agent/session 目录会覆盖相应 Pi 环境变量。
2. 预先设置为 `.pi` 的 Pi 环境变量不会泄漏进插件。
3. 两代 Pi coding-agent import 都解析到 facade，并获得 `.bangboo`、当前 runtime 导出和当前 Bangboo CLI。
4. 使用与 `pi-subagents` 相同的 package-root 探测方式时，用户和项目配置解析到 Bangboo 目录；子代理命令解析到 Bangboo。
5. HOME 和项目中的 `.pi` canary 不被读取或修改，`.bangboo` 资源仍正常加载。
6. 安装含真实硬编码 `.pi` 的 fixture 时安装成功并输出文件、行号和总数。
7. `.pi-subagents`、文档、测试和嵌套依赖不产生误报。
8. 安装安全 fixture 时保持静默。
9. update 路径不执行扫描。
10. 扫描整体失败时安装成功并报告扫描未完成。
11. packed tarball 包含 facade，且 facade 的 bin 目标真实存在并可运行。

## 文档

更新 `README.md` 的 community package compatibility 部分：

- 说明运行时会把受支持的 Pi 配置入口重定向到 Bangboo。
- 说明首次安装会扫描潜在硬编码 `.pi` 并给出提示。
- 明确提示不等于安全审计或兼容性保证，Bangboo 不会修改插件。
- 保留并引用数据隔离章节，不复制出相互冲突的目录规则。

## 成功标准

1. 当前 `pi-subagents` 的用户级和项目级配置都从 Bangboo 目录读取。
2. `pi-subagents` 启动的子代理继续运行当前 Bangboo CLI。
3. `.pi` canary 始终未被访问或修改。
4. 首次安装写死 `.pi` 的插件时出现明确、非阻塞、有限长度的提醒。
5. update 命令不扫描插件。
6. 打包产物包含完整 facade，`npm run verify` 全部通过且没有跳过测试。
