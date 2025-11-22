// Middleware to check user roles
// Usage: router.get("/admin-only", authMiddleware, requireRole(["admin"]), handler)
import express from "express";
import cors from "cors";

const app = express();

// CORS configuration
app.use(cors({
    origin: "http://localhost:3000", // ganti dengan domain frontend kamu
    credentials: true, // penting agar cookie ikut dikirim
  })
);

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
export const requirePM = requireRole(["pm", "admin"]);
export const requireStaff = requireRole(["staff", "pm", "admin"]);

// Check if user is admin
export function isAdmin(req) {
  return req.user && req.user.role === "admin";
}

// Check if user is PM
export function isPM(req) {
  return req.user && req.user.role === "pm";
}

// Check if user is Sales
export function isSales(req) {
  return req.user && req.user.role === "sales";
}

// Check if user is Staff
export function isStaff(req) {
  return req.user && req.user.role === "staff";
}