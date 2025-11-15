import express from "express";
import dotenv from "dotenv";
import authMiddleware from "./middleware/authMiddleware.js";
import { requireAdmin, requireSales, requirePM, requireStaff } from "./middleware/roleMiddleware.js";
import authRoutes from "./routes/auth.js";
import staffRouter from "./routes/staff.js";
import profileRouter from "./routes/profile.js";
import projectRoutes from "./routes/project/index.js";
import cors from "cors";
import cookieParser from "cookie-parser";



dotenv.config();
const app = express();

app.use(cookieParser());
// CORS configuration
app.use(cors({
    origin: "http://localhost:3000", // ganti dengan domain frontend kamu
    credentials: true, // penting agar cookie ikut dikirim
  })
);

// Middleware
app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

// Auth routes
app.use("/api/auth", authRoutes);

// Profile routes
app.use("/api/profile", profileRouter);

// Projects
app.use("/api/project", projectRoutes);

// Staff management (admin only)
app.use("/api/staff", staffRouter);

// Role-based page access endpoints
// These can be used by frontend to verify access before loading pages

// Admin page - only admins can access
app.get("/api/pages/admin", authMiddleware, requireAdmin, (req, res) => {
  res.json({ 
    message: "Admin page access granted",
    user: req.user 
  });
});

// Sales page - only sales and admin can access
app.get("/api/pages/sales", authMiddleware, requireSales, (req, res) => {
  res.json({ 
    message: "Sales page access granted",
    user: req.user 
  });
});

// PM page - only PM and admin can access
app.get("/api/pages/pm", authMiddleware, requirePM, (req, res) => {
  res.json({ 
    message: "PM page access granted",
    user: req.user 
  });
});

// Staff page - staff, PM, and admin can access
app.get("/api/pages/staff", authMiddleware, requireStaff, (req, res) => {
  res.json({ 
    message: "Staff page access granted",
    user: req.user 
  });
});

// Test protected endpoint
app.get("/api/secret", authMiddleware, (req, res) => {
  res.json({
    message: `Welcome, user ${req.user.id} with role ${req.user.role}!`
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});




// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0",  () => {
  console.log(`Server running on port ${PORT}`);
});