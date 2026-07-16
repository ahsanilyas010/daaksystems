import type { AuthedUser } from "./middleware/auth.js";
import type { AuthedRider } from "./middleware/riderAuth.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
      rider?: AuthedRider;
    }
  }
}

export {};
