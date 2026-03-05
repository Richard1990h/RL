export interface AccountStatusLike {
  isBanned: boolean;
  isDeactivated?: boolean | null;
}

export function isAccountRestricted(account: AccountStatusLike): boolean {
  return account.isBanned === true || account.isDeactivated === true;
}

export function isOwnerDeviceGateEnforced(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.ENFORCE_OWNER_DEVICE_GATE?.trim().toLowerCase();
  return flag !== "false";
}

export function getRequestIp(forwardedFor: string | null, realIp: string | null): string {
  const firstForwarded = forwardedFor?.split(",")[0]?.trim();
  return firstForwarded || realIp || "unknown";
}
