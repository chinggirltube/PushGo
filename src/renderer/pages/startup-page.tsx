import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../context/app-context";

export function StartupPage() {
  const navigate = useNavigate();
  const { state, gitChecked, gitWarning, setGitResult, setError, clearTransientMessages } = useAppContext();
  const [checking, setChecking] = useState(false);

  const runCheck = useCallback(async () => {
    setChecking(true);
    clearTransientMessages();

    const result = await window.pushgo.checkGit();
    if (result.ok) {
      setGitResult(result.data.installed, result.data.warning);
      if (result.data.warning) {
        setError(result.data.warning);
      }
    } else {
      setGitResult(false, result.error);
      setError(result.error);
    }

    setChecking(false);
  }, [clearTransientMessages, setError, setGitResult]);

  useEffect(() => {
    if (!gitChecked) {
      void runCheck();
    }
  }, [gitChecked, runCheck]);

  const statusText = !state.gitInstalled
    ? "未检测到 Git，安装后即可使用"
    : gitWarning
      ? "已安装 Git，但授权组件未就绪（请按提示处理）"
      : "已检测到 Git 和授权组件，可继续";

  return (
    <section className="panel fade-in">
      <h1>开始前检查</h1>
      <p className="desc">我们先确认你的电脑已安装 Git，并具备首次授权弹窗能力</p>

      <div className={`status ${state.gitInstalled && !gitWarning ? "ok" : "warn"}`}>{statusText}</div>

      <div className="actions">
        {!state.gitInstalled ? (
          <button
            className="ghost"
            onClick={async () => {
              await window.pushgo.openExternal({ url: "https://git-scm.com/downloads" });
            }}
          >
            去安装 Git
          </button>
        ) : null}

        <button className="ghost" onClick={runCheck} disabled={checking}>
          {checking ? "检测中..." : "重新检测"}
        </button>

        <button
          className="primary"
          disabled={!state.gitInstalled || checking}
          onClick={() => {
            navigate("/select");
          }}
        >
          下一步
        </button>
      </div>
    </section>
  );
}
