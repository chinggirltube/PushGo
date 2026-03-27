import { useNavigate } from "react-router-dom";
import { useAppContext } from "../context/app-context";

export function CompletePage() {
  const navigate = useNavigate();
  const { state, pushMeta, setNotice, setError, resetForNextPush } = useAppContext();

  const repoUrl = state.repoUrl ?? "";

  const copyRepo = async () => {
    try {
      await navigator.clipboard.writeText(repoUrl);
      setNotice("仓库链接已复制");
    } catch {
      setError({ code: "UNKNOWN", message: "复制失败，请手动复制链接" });
    }
  };

  const openRepo = async () => {
    if (!repoUrl) {
      return;
    }

    const result = await window.pushgo.openExternal({ url: repoUrl });
    if (!result.ok) {
      setError(result.error);
    }
  };

  return (
    <section className="panel fade-in">
      <h1>推送成功</h1>

      <p className="repo-url">{repoUrl}</p>

      {pushMeta?.fallbackToMaster ? <p className="desc">已自动回退到 master 分支完成推送。</p> : null}

      <div className="actions">
        <button className="ghost" onClick={copyRepo}>
          复制仓库链接
        </button>
        <button className="ghost" onClick={openRepo}>
          在浏览器打开
        </button>
        <button
          className="primary"
          onClick={() => {
            resetForNextPush();
            navigate("/select");
          }}
        >
          再次推送
        </button>
      </div>
    </section>
  );
}
