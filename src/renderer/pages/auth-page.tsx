import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../context/app-context";

const AUTH_STATUS_TIMEOUT_MS = 8_000;

export function AuthPage() {
  const navigate = useNavigate();
  const { state, setAuthStatus, setError, clearTransientMessages } = useAppContext();
  const [checking, setChecking] = useState(false);
  const [working, setWorking] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    if (!state.platform || !state.repoUrl || !state.projectPath) {
      navigate("/select", { replace: true });
      return;
    }

    let cancelled = false;

    const checkStatus = async () => {
      setChecking(true);
      try {
        const result = await Promise.race([
          window.pushgo.authStatus({ platform: state.platform!, repoUrl: state.repoUrl! }),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("AUTH_STATUS_TIMEOUT")), AUTH_STATUS_TIMEOUT_MS);
          })
        ]);

        if (result.ok) {
          if (!cancelled) {
            setLoggedIn(result.data.loggedIn);
            setAuthStatus(state.platform!, result.data.loggedIn);
          }
        } else {
          if (!cancelled) {
            setError(result.error);
          }
        }
      } catch {
        if (!cancelled) {
          setError({ code: "UNKNOWN", message: "登录状态检查失败，请点击“去登录授权”继续" });
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    };

    void checkStatus();

    return () => {
      cancelled = true;
    };
  }, [navigate, state.platform, state.projectPath, state.repoUrl]);

  const proceed = async () => {
    if (!state.platform) {
      return;
    }

    setWorking(true);
    clearTransientMessages();

    try {
      if (!loggedIn) {
        const loginResult = await window.pushgo.authLogin({ platform: state.platform, repoUrl: state.repoUrl! });
        if (!loginResult.ok) {
          setError(loginResult.error);
          return;
        }

        setAuthStatus(state.platform, true);
        setLoggedIn(true);
      }

      navigate("/push");
    } catch {
      setError({ code: "UNKNOWN", message: "发起授权失败，请重试" });
    } finally {
      setWorking(false);
    }
  };

  const platformLabel =
    state.platform === "github" ? "GitHub" : state.platform === "gitee" ? "Gitee" : "Gitea";

  return (
    <section className="panel fade-in">
      <h1>登录并授权</h1>
      <p className="desc">需要完成 {platformLabel} 授权后才能推送代码</p>
      <p className="desc">若已配置 OAuth，点击后会在浏览器打开授权页；未配置时首次推送会由系统 Git 凭据窗口发起授权。</p>

      <div className={`status ${loggedIn ? "ok" : "warn"}`}>
        {checking ? "正在检查登录状态..." : loggedIn ? `已登录 ${platformLabel}，可以继续` : `当前会话未登录 ${platformLabel}`}
      </div>

      <div className="actions">
        <button className="ghost" onClick={() => navigate("/repo")}>返回上一步</button>
        <button className="primary" onClick={proceed} disabled={checking || working}>
          {working ? "处理中..." : loggedIn ? "开始推送" : "去登录授权"}
        </button>
      </div>
    </section>
  );
}
