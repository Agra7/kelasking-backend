import jwt from "jsonwebtoken";
import cors from "cors";
import express from "express";

const app = express();

// CORS configuration
app.use(cors({
    origin: "http://localhost:3000", // ganti dengan domain frontend kamu
    credentials: true, // penting agar cookie ikut dikirim
  })
);


async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Authorization header missing" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token missing" });

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (error) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}




export default authMiddleware;
