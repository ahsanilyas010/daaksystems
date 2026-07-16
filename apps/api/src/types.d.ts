import type { AuthedUser } from "./middleware/auth.js";
import type { AuthedCustomer } from "./middleware/customerAuth.js";
import type { AuthedRider } from "./middleware/riderAuth.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
      rider?: AuthedRider;
      customer?: AuthedCustomer;
    }
  }
}

export {};
