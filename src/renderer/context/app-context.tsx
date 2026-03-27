import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { ValidateUrlResult } from "../../shared/bridge";
import { AppErrorPayload, AppState, PushProgressEvent, PushRunMeta, Platform } from "../../shared/contracts";

const initialState: AppState = {
  gitInstalled: false,
  platform: null,
  projectPath: null,
  repoUrl: null,
  auth: {
    github: false,
    gitee: false,
    gitea: false
  }
};

type AppContextValue = {
  state: AppState;
  gitChecked: boolean;
  gitWarning: AppErrorPayload | null;
  repoValidation: ValidateUrlResult | null;
  progress: PushProgressEvent | null;
  pushMeta: PushRunMeta | null;
  error: AppErrorPayload | null;
  notice: string | null;
  setPlatform: (platform: Platform) => void;
  setProjectPath: (projectPath: string | null) => void;
  setRepoUrl: (repoUrl: string | null) => void;
  setGitResult: (installed: boolean, warning?: AppErrorPayload) => void;
  setAuthStatus: (platform: Platform, loggedIn: boolean) => void;
  setRepoValidation: (result: ValidateUrlResult | null) => void;
  setProgress: (progress: PushProgressEvent | null) => void;
  setPushMeta: (meta: PushRunMeta | null) => void;
  setError: (error: AppErrorPayload | null) => void;
  setNotice: (notice: string | null) => void;
  clearTransientMessages: () => void;
  resetForNextPush: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [gitChecked, setGitChecked] = useState(false);
  const [gitWarning, setGitWarning] = useState<AppErrorPayload | null>(null);
  const [repoValidation, setRepoValidationState] = useState<ValidateUrlResult | null>(null);
  const [progress, setProgressState] = useState<PushProgressEvent | null>(null);
  const [pushMeta, setPushMetaState] = useState<PushRunMeta | null>(null);
  const [error, setErrorState] = useState<AppErrorPayload | null>(null);
  const [notice, setNoticeState] = useState<string | null>(null);

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      gitChecked,
      gitWarning,
      repoValidation,
      progress,
      pushMeta,
      error,
      notice,
      setPlatform: (platform) => {
        setState((prev) => ({ ...prev, platform }));
      },
      setProjectPath: (projectPath) => {
        setState((prev) => ({ ...prev, projectPath }));
      },
      setRepoUrl: (repoUrl) => {
        setState((prev) => ({ ...prev, repoUrl }));
      },
      setGitResult: (installed, warning) => {
        setGitChecked(true);
        setGitWarning(warning ?? null);
        setState((prev) => ({ ...prev, gitInstalled: installed }));
      },
      setAuthStatus: (platform, loggedIn) => {
        setState((prev) => {
          if (prev.auth[platform] === loggedIn) {
            return prev;
          }

          return {
            ...prev,
            auth: {
              ...prev.auth,
              [platform]: loggedIn
            }
          };
        });
      },
      setRepoValidation: (result) => {
        setRepoValidationState(result);
      },
      setProgress: (nextProgress) => {
        setProgressState(nextProgress);
      },
      setPushMeta: (meta) => {
        setPushMetaState(meta);
      },
      setError: (nextError) => {
        setErrorState(nextError);
      },
      setNotice: (nextNotice) => {
        setNoticeState(nextNotice);
      },
      clearTransientMessages: () => {
        setErrorState(null);
        setNoticeState(null);
      },
      resetForNextPush: () => {
        setProgressState(null);
        setPushMetaState(null);
        setErrorState(null);
        setNoticeState(null);
      }
    }),
    [state, gitChecked, gitWarning, repoValidation, progress, pushMeta, error, notice]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used inside AppProvider");
  }

  return ctx;
}
