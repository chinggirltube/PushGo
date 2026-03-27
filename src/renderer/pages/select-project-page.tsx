import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Platform } from "../../shared/contracts";
import { useAppContext } from "../context/app-context";

const PLATFORM_LIST: Array<{ key: Platform; label: string; desc: string }> = [
  { key: "github", label: "GitHub", desc: "适合开源与国际协作" },
  { key: "gitee", label: "Gitee", desc: "适合国内网络环境" },
  { key: "gitea", label: "Gitea", desc: "适合私有化或自建代码服务" }
];

export function SelectProjectPage() {
  const navigate = useNavigate();
  const { state, setPlatform, setProjectPath, setError, clearTransientMessages } = useAppContext();
  const [browsing, setBrowsing] = useState(false);

  const browseFolder = async () => {
    setBrowsing(true);
    const result = await window.pushgo.selectFolder();
    if (result.ok) {
      setProjectPath(result.data.path);
      clearTransientMessages();
    } else {
      setError(result.error);
    }
    setBrowsing(false);
  };

  const canNext = Boolean(state.platform && state.projectPath);

  return (
    <section className="panel fade-in">
      <h1>选择平台和项目</h1>

      <div className="platform-grid">
        {PLATFORM_LIST.map((item) => (
          <button
            key={item.key}
            className={`platform-item ${state.platform === item.key ? "active" : ""}`}
            onClick={() => setPlatform(item.key)}
          >
            <span className="platform-name">{item.label}</span>
            <span className="platform-desc">{item.desc}</span>
          </button>
        ))}
      </div>

      <div className="drop-zone browse-only">
        <p>点击浏览选择项目文件夹</p>
        <button className="ghost" onClick={browseFolder} disabled={browsing}>
          {browsing ? "打开中..." : "点击浏览"}
        </button>
      </div>

      {state.projectPath ? (
        <p className="path-view">
          已选文件夹：<span>{state.projectPath}</span>
          <button className="link-like" onClick={browseFolder}>
            重新选择
          </button>
        </p>
      ) : null}

      <div className="actions">
        <button className="ghost" onClick={() => navigate("/")}>
          返回上一步
        </button>
        <button
          className="primary"
          disabled={!canNext}
          onClick={() => {
            navigate("/repo");
          }}
        >
          下一步
        </button>
      </div>
    </section>
  );
}
