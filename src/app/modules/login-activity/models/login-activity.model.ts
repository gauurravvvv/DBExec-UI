/**
 * Client-side shape of a login-activity row — mirrors the BE
 * `mapLoginActivityRow` contract EXACTLY. NAMES ONLY: the internal
 * `userId` / `organisationId` / `sessionId` are not on the wire. `username`
 * and `organisationName` are denormalized at write-time so a later user
 * deletion still shows who attempted the login. `success` is derived by the
 * BE from `eventType` so the FE renders the outcome without re-deriving it.
 */
export interface LoginActivity {
  id: string;
  username: string;
  organisationName: string | null;
  eventType: string;
  failureReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  createdOn: string;
}
