import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Platform } from "../../shared/contracts";
import { useAppContext } from "../context/app-context";

const PLATFORM_TEXT: Record<Platform, string> = {
  github: "GitHub",
  gitee: "Gitee",
  gitea: "Gitea"
};

export function RepoPage() {
  const navigate = useNavigate();
  const { state, setPlatform, setRepoUrl, setRepoValidation, repoValidation, setError, clearTransientMessages } =
    useAppContext();
  const [urlInput, setUrlInput] = useState(state.repoUrl ?? "");
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    if (!state.platform || !state.projectPath) {
      navigate("/select", { replace: true });
    }
  }, [navigate, state.platform, state.projectPath]);

  useEffect(() => {
    setUrlInput(state.repoUrl ?? "");
  }, [state.repoUrl]);

  const canSubmit = useMemo(() => Boolean(urlInput.trim()), [urlInput]);

  const validateNow = async () => {
    if (!state.platform) {
      return;
    }

    setValidating(true);
    setRepoUrl(urlInput.trim());
    clearTransientMessages();

    const result = await window.pushgo.validateRepoUrl({
      url: urlInput.trim(),
      platform: state.platform
    });

    if (result.ok) {
      setRepoValidation(result.data);
      if (result.data.ok) {
        navigate("/auth");
      } else {
        setError({
          code: result.data.code ?? "UNKNOWN",
          message: result.data.message ?? "仓库地址格式不正确，请检查后重试"
        });
      }
    } else {
      setError(result.error);
    }

    setValidating(false);
  };

  const mismatchPlatform =
    repoValidation?.code === "URL_PLATFORM_MISMATCH" && repoValidation.detectedPlatform
      ? repoValidation.detectedPlatform
      : null;

  return (
    <section className="panel fade-in">
      <h1>填写仓库地址</h1>
      <p className="desc">粘贴仓库地址，例如 https://github.com/name/repo.git 或 https://gitea.com/name/repo.git</p>

      <label className="field-label" htmlFor="repo-url">
        仓库 URL
      </label>
      <input
        id="repo-url"
        className="input"
        placeholder="粘贴仓库地址，例如 https://github.com/name/repo.git 或 https://gitea.com/name/repo.git"
        value={urlInput}
        onChange={(event) => {
          setUrlInput(event.target.value);
          setRepoValidation(null);
        }}
      />

      {repoValidation?.ok ? <p className="validation ok">仓库地址可用</p> : null}
      {repoValidation && !repoValidation.ok ? (
        <p className="validation error">{repoValidation.message ?? "仓库地址格式不正确，请检查后重试"}</p>
      ) : null}

      {mismatchPlatform ? (
        <button
          className="ghost"
          onClick={() => {
            setPlatform(mismatchPlatform);
            setRepoValidation(null);
            clearTransientMessages();
          }}
        >
          一键切换到 {PLATFORM_TEXT[mismatchPlatform]}
        </button>
      ) : null}

      <div className="actions">
        <button className="ghost" onClick={() => navigate("/select")}>
          返回上一步
        </button>
        <button className="primary" disabled={!canSubmit || validating} onClick={validateNow}>
          {validating ? "校验中..." : "下一步"}
        </button>
      </div>
    </section>
  );
}
