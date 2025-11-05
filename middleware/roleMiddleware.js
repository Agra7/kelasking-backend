// Middleware to check user roles
// Usage: router.get("/admin-only", authMiddleware, requireRole(["admin"]), handler)

export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Access denied. Required role: ${allowedRoles.join(" or ")}` 
      });
    }

    next();
  };
}

// Convenience middleware for common role checks
export const requireAdmin = requireRole(["admin"]);
export const requireSales = requireRole(["sales", "admin"]);
export const requirePM = requireRole(["PM", "admin"]);
export const requireStaff = requireRole(["staff", "PM", "admin"]);

// Check if user is admin
export function isAdmin(req) {
  return req.user && req.user.role === "admin";
}

// Check if user is PM
export function isPM(req) {
  return req.user && req.user.role === "PM";
}

// Check if user is Sales
export function isSales(req) {
  return req.user && req.user.role === "sales";
}

// Check if user is Staff
export function isStaff(req) {
  return req.user && req.user.role === "staff";
}