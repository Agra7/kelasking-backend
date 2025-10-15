import express from "express";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import staffRouter from "./routes/staff.js";
import authMiddleware from "./middleware/authMiddleware.js";
import projectRoutes from "./routes/project/index.js";

dotenv.config();
const app = express();

// Middleware
app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

// Auth
app.use("/api/auth", authRoutes);

// Projects
app.use("/api/project", projectRoutes);

// Staff
app.use("/staff", staffRouter);

// Start server
app.listen(5000, () => {
  console.log("Server running on port 5000");
});

// Middleware
app.get("/api/secret", authMiddleware, (req, res) => {
  res.json({
    message: `Welcome, user ${req.user.id} with role ${req.user.role}!`
  });
});