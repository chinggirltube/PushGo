import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PushStage } from "../../shared/contracts";
import { useAppContext } from "../context/app-context";

const STEP_ORDER: Array<{ key: PushStage; label: string }> = [
  { key: "prepare", label: "准备仓库" },
  { key: "collect", label: "整理文件" },
  { key: "commit", label: "提交变更" },
  { key: "upload", label: "上传到远端" }
];

export function PushPage() {
  const navigate = useNavigate();
  const { state, progress, setProgress, setPushMeta, setError, setNotice, clearTransientMessages } = useAppContext();
  const [running, setRunning] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!state.platform || !state.projectPath || !state.repoUrl) {
      navigate("/select", { replace: true });
    }
  }, [navigate, state.platform, state.projectPath, state.repoUrl]);

  useEffect(() => {
    const unsubscribe = window.pushgo.onPushProgress((event) => {
      setProgress(event);
    });

    return () => {
      unsubscribe();
    };
  }, [setProgress]);

  const runPush = useCallback(async () => {
    if (!state.platform || !state.projectPath || !state.repoUrl || running) {
      return;
    }

    setRunning(true);
    clearTransientMessages();

    const result = await window.pushgo.runPush({
      platform: state.platform,
      projectPath: state.projectPath,
      repoUrl: state.repoUrl
    });

    if (result.ok) {
      setPushMeta(result.data.meta);
      const notices: string[] = [];
      if (result.data.meta.commitStatus === "no_changes") {
        notices.push("没有检测到新变更，已尝试直接推送");
      }
      if (result.data.meta.fallbackToMaster) {
        notices.push("远端仅支持 master，已自动回退并完成推送");
      }
      if (notices.length > 0) {
        setNotice(notices.join("；"));
      }

      navigate("/done");
    } else {
      setError(result.error);
    }

    setRunning(false);
  }, [
    clearTransientMessages,
    navigate,
    running,
    setError,
    setNotice,
    setPushMeta,
    state.platform,
    state.projectPath,
    state.repoUrl
  ]);

  useEffect(() => {
    if (!state.platform || !state.projectPath || !state.repoUrl || startedRef.current) {
      return;
    }

    startedRef.current = true;
    void runPush();
  }, [runPush, state.platform, state.projectPath, state.repoUrl]);

  const activeIndex = useMemo(() => {
    const currentStage = progress?.stage ?? "prepare";
    const idx = STEP_ORDER.findIndex((item) => item.key === currentStage);
    return idx === -1 ? 0 : idx;
  }, [progress?.stage]);

  return (
    <section className="panel fade-in">
      <h1>正在推送</h1>

      <ul className="progress-list">
        {STEP_ORDER.map((item, index) => (
          <li
            key={item.key}
            className={`progress-item ${index < activeIndex ? "done" : ""} ${index === activeIndex ? "active" : ""}`}
          >
            <span>{item.label}</span>
          </li>
        ))}
      </ul>

      <div className="actions">
        {!running ? (
          <button className="ghost" onClick={() => navigate("/auth")}>
            返回上一步
          </button>
        ) : null}
        <button className="primary" disabled={running} onClick={() => void runPush()}>
          {running ? "正在推送..." : "重新推送"}
        </button>
      </div>
    </section>
  );
}
