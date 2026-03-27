# PushGo MVP

小白一键把本地项目推送到 GitHub / Gitee / Gitea 的桌面应用（Electron + React + TypeScript + Vite）。

## 功能覆盖

- 启动自动检测 Git 安装状态与授权组件可用性
- 平台选择（GitHub / Gitee / Gitea）
- 项目文件夹仅支持“点击浏览”选择（已移除拖拽入口，提升跨平台稳定性）
- 仓库 URL 格式与平台匹配校验
- 系统浏览器授权（不使用内嵌网页）
- Gitea 在自建场景下优先按仓库 URL 域名发起登录/授权
- 自动执行 `git init` / `add -A` / `commit` / `remote` / `push`
- 推送默认 `main`，必要时自动回退 `master`
- 成功页支持复制仓库链接和浏览器打开
- 不保存历史记录（路径、URL、操作记录不落盘）
- 登录 token 仅保留在进程内存（关闭应用即失效）

## 技术栈

- Electron
- React + React Router
- TypeScript
- Vite
- Node `child_process` 调用本机 `git`

## 目录结构

```txt
src/
  main/        # Electron 主进程、服务层、IPC
  preload/     # 白名单桥接 API
  renderer/    # React UI 与流程页面
  shared/      # 前后端共享类型与通道常量
docs/
  ai-progress.md
  ai-handoff.md
  git-identity-setup.md
```

Git 身份设置教程：`docs/git-identity-setup.md`

## 本地运行

### 1) 安装依赖

```bash
npm install
```

### 2) 开发启动

```bash
npm run dev
```

### 3) 构建

```bash
npm run build
```

### 4) 打包

```bash
npm run package
```

## OAuth 配置（可选增强）

当前支持两种模式：

- 默认模式（未配置 OAuth env）：推送时走系统 git 凭据授权链路（如 Git Credential Manager）。首次通常会出现登录/授权窗口，后续会复用授权；若在平台端撤销授权会再次触发。
- 增强模式（配置 OAuth env）：走完整 OAuth 授权码流程并换取 token（仅内存保存，会话结束清空）。

说明：

- Gitea 域名优先级：`repoUrl > PUSHGO_GITEA_BASE_URL > https://gitea.com`。
- 若目标系统缺失 git 凭据助手，默认模式可能无法完成授权。

如需启用增强模式，请配置：

```bash
# GitHub OAuth App
export PUSHGO_GITHUB_CLIENT_ID=your_client_id
export PUSHGO_GITHUB_CLIENT_SECRET=your_client_secret

# Gitee OAuth App
export PUSHGO_GITEE_CLIENT_ID=your_client_id
export PUSHGO_GITEE_CLIENT_SECRET=your_client_secret

# Gitea OAuth App（可用自建域名）
export PUSHGO_GITEA_BASE_URL=https://gitea.com
export PUSHGO_GITEA_CLIENT_ID=your_client_id
export PUSHGO_GITEA_CLIENT_SECRET=your_client_secret
# 可选，默认 write:repository
export PUSHGO_GITEA_SCOPE=write:repository
```

授权回调采用本地临时端口（`http://127.0.0.1:{port}/oauth/callback`），请在 OAuth 应用配置中允许本地回调。

## IPC 通道

- `app:check-git`
- `auth:login`
- `auth:logout`
- `auth:status`
- `repo:validate-url`
- `git:select-folder`
- `push:run`
- `app:open-external`
- 事件：`push:progress`

## 错误提示策略

主流程使用统一中文错误对象：

```ts
{ code, message, actionText?, actionType? }
```

覆盖文档要求的核心错误码，包括：

- Git 未安装
- URL 格式错误 / 平台不匹配
- 授权取消 / 授权失败
- 仓库初始化失败
- 无变更提交
- 远端设置失败
- 推送鉴权失败 / 推送被拒绝
- 网络超时
- 未知错误

## 隐私与会话策略

- 不写入 localStorage 的历史数据
- 不落盘保存项目路径/仓库 URL 历史
- token 仅存内存 Map
- BrowserWindow 使用临时 session 分区（关闭应用即清空）

## 已知限制

- 默认模式依赖系统 git 凭据能力，若环境未安装/未启用可能无法完成首授。
- 若远端启用更严格策略（受保护分支、组织 SSO、强制签名），推送可能被拒绝。
- 当前为 MVP：不包含冲突可视化、分支管理、PR 流程等扩展能力。

## 故障排查（授权弹窗）

- 若你看到的是“终端要求用户名/密码”而不是浏览器授权弹窗，通常不是 `npm run dev` 本身的问题，而是当前 `git` 没有启用 `credential.helper`。
- 启动页会自动检测并尽量自动配置弹窗型凭据助手（GCM）；若仍未就绪会在页面顶部给出明确提示和跳转入口。
- 可用以下命令检查：

```bash
git config --get-all credential.helper
```

- 若为空，请安装并启用 Git Credential Manager（或在当前系统配置有效的 git 凭据助手）后重试。
- PushGo 在推送时会关闭终端口令提示并强制 GCM 交互模式；打包后无终端窗口时也应走浏览器/系统授权弹窗。
