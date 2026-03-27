import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAppContext } from "./context/app-context";
import { AuthPage } from "./pages/auth-page";
import { CompletePage } from "./pages/complete-page";
import { PushPage } from "./pages/push-page";
import { RepoPage } from "./pages/repo-page";
import { SelectProjectPage } from "./pages/select-project-page";
import { StartupPage } from "./pages/startup-page";

const STEP_LABELS: Record<string, string> = {
  "/": "开始前检查",
  "/select": "选择平台和项目",
  "/repo": "填写仓库地址",
  "/auth": "登录并授权",
  "/push": "正在推送",
  "/done": "推送成功"
};

export default function App() {
  const location = useLocation();
  const { error, notice, setError } = useAppContext();

  const currentLabel = STEP_LABELS[location.pathname] ?? "PushGo";

  return (
    <div className="app-shell">
      <div className="bg-orb bg-orb-a" />
      <div className="bg-orb bg-orb-b" />

      <header className="topbar">
        <div className="brand-line">
          <span className="brand">PushGo</span>
          <span className="brand-sub">小白一键推送到 GitHub / Gitee / Gitea</span>
        </div>
        <div className="step-label">{currentLabel}</div>
      </header>

      <main className="main-wrap">
        {notice ? <div className="hint success">{notice}</div> : null}
        {error ? (
          <div className="hint error">
            <div>{error.message}</div>
            {error.actionType === "open_git_download" ? (
              <button
                className="hint-action"
                onClick={async () => {
                  await window.pushgo.openExternal({ url: "https://git-scm.com/downloads" });
                }}
              >
                {error.actionText ?? "去安装 Git"}
              </button>
            ) : null}
            {error.actionType === "open_gcm_download" ? (
              <button
                className="hint-action"
                onClick={async () => {
                  await window.pushgo.openExternal({ url: "https://github.com/git-ecosystem/git-credential-manager" });
                }}
              >
                {error.actionText ?? "安装凭据助手"}
              </button>
            ) : null}
            <button className="hint-close" onClick={() => setError(null)}>
              我知道了
            </button>
          </div>
        ) : null}

        <Routes>
          <Route path="/" element={<StartupPage />} />
          <Route path="/select" element={<SelectProjectPage />} />
          <Route path="/repo" element={<RepoPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/push" element={<PushPage />} />
          <Route path="/done" element={<CompletePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
