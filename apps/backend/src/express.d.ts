import type { PortalUser } from "@security-portal/shared";

declare global {
  namespace Express {
    interface Request {
      user: PortalUser;
    }
  }
}
