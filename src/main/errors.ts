import { AppErrorPayload, ErrorCode } from "../shared/contracts";

type ErrorDefinition = {
  message: string;
  actionText?: string;
  actionType?: string;
};

const ERROR_MAP: Record<ErrorCode, ErrorDefinition> = {
  APP_GIT_NOT_FOUND: {
    message: "未检测到 Git，请先安装后再继续",
    actionText: "去安装 Git",
    actionType: "open_git_download"
  },
  APP_GIT_HELPER_MISSING: {
    message: "已安装 Git，但未检测到可用凭据助手，首次授权窗口可能无法弹出",
    actionText: "安装凭据助手",
    actionType: "open_gcm_download"
  },
  APP_GIT_HELPER_UNSUPPORTED: {
    message: "当前 Git 凭据助手不支持授权弹窗，请切换到 Git Credential Manager",
    actionText: "查看配置说明",
    actionType: "open_gcm_download"
  },
  APP_FOLDER_INVALID: {
    message: "请选择有效的项目文件夹"
  },
  URL_INVALID_FORMAT: {
    message: "仓库地址格式不正确，请检查后重试"
  },
  URL_PLATFORM_MISMATCH: {
    message: "仓库地址与当前平台不一致，是否切换平台？"
  },
  AUTH_CANCELLED: {
    message: "你已取消登录授权，可重新发起"
  },
  AUTH_FAILED: {
    message: "登录失败，请稍后重试"
  },
  GIT_INIT_FAILED: {
    message: "初始化仓库失败，请检查文件夹权限"
  },
  GIT_COMMIT_NO_CHANGES: {
    message: "没有检测到新变更，已尝试直接推送"
  },
  GIT_REMOTE_SET_FAILED: {
    message: "设置远端仓库失败，请检查仓库地址"
  },
  GIT_PUSH_AUTH_FAILED: {
    message: "推送失败：账号无权限或授权已失效"
  },
  GIT_PUSH_REJECTED: {
    message: "推送被拒绝，远端可能有更新，请先同步"
  },
  NETWORK_TIMEOUT: {
    message: "网络超时，请检查网络后重试"
  },
  UNKNOWN: {
    message: "发生未知错误，请重试"
  }
};

export class AppError extends Error {
  readonly payload: AppErrorPayload;

  constructor(code: ErrorCode, overrides?: Partial<AppErrorPayload>) {
    const base = ERROR_MAP[code];
    super(overrides?.message ?? base.message);
    this.name = "AppError";
    this.payload = {
      code,
      message: overrides?.message ?? base.message,
      actionText: overrides?.actionText ?? base.actionText,
      actionType: overrides?.actionType ?? base.actionType
    };
  }
}

export function createAppError(code: ErrorCode, overrides?: Partial<AppErrorPayload>): AppError {
  return new AppError(code, overrides);
}

export function toAppErrorPayload(error: unknown, fallbackCode: ErrorCode = "UNKNOWN"): AppErrorPayload {
  if (error instanceof AppError) {
    return error.payload;
  }

  if (isPayload(error)) {
    return error;
  }

  const base = ERROR_MAP[fallbackCode];
  return {
    code: fallbackCode,
    message: base.message,
    actionText: base.actionText,
    actionType: base.actionType
  };
}

function isPayload(error: unknown): error is AppErrorPayload {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    typeof (error as { message: unknown }).message === "string"
  );
}

export function isGitNotFound(output: string): boolean {
  const content = output.toLowerCase();
  return content.includes("command not found") || content.includes("is not recognized") || content.includes("enoent");
}

export function inferGitPushError(stderr: string): AppError {
  const message = stderr.toLowerCase();

  if (message.includes("no credential store has been selected") || message.includes("credential.credentialstore")) {
    return createAppError("GIT_PUSH_AUTH_FAILED", {
      message: "Git Credential Manager 未配置凭据存储。请先配置 credential.credentialStore（如 cache 或 secretservice）后重试。"
    });
  }

  if (message.includes("can not use the 'cache' credential store on windows")) {
    return createAppError("GIT_PUSH_AUTH_FAILED", {
      message: "Windows 不支持 cache 凭据存储。请改用 wincredman 后重试。"
    });
  }

  if (message.includes("credential-manager") && message.includes("is not a git command")) {
    return createAppError("GIT_PUSH_AUTH_FAILED", {
      message: "未找到 Git Credential Manager 可执行程序，请安装并启用后重试。"
    });
  }

  if (
    message.includes("user interaction is not allowed") ||
    message.includes("cannot prompt because user interactivity has been disabled") ||
    message.includes("unable to open browser") ||
    message.includes("failed to launch browser")
  ) {
    return createAppError("GIT_PUSH_AUTH_FAILED", {
      message: "无法拉起授权窗口。请检查系统默认浏览器与图形会话后重试。"
    });
  }

  if (
    message.includes("authentication failed") ||
    message.includes("could not read username") ||
    message.includes("403") ||
    message.includes("access denied")
  ) {
    return createAppError("GIT_PUSH_AUTH_FAILED");
  }

  if (message.includes("failed to push some refs") || message.includes("non-fast-forward") || message.includes("rejected")) {
    return createAppError("GIT_PUSH_REJECTED");
  }

  if (message.includes("timed out") || message.includes("timeout")) {
    return createAppError("NETWORK_TIMEOUT");
  }

  return createAppError("UNKNOWN");
}
