import type { AuthedUser } from "./middleware/auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export {};
