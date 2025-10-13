import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import supabase from "../db.js";

const router = express.Router();

// Register
router.post("/register", async (req, res) => {
  const { user_name, email, password, role } = req.body;

  if (!user_name || !email || !password || !role) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { user_name, role } // metadata passed to trigger
      }
    });

    if (error) throw error;

    res.json({ message: "User registered!", user: data.user });
  } catch (err) {
    console.error("Register error:", err);
    res.status(400).json({ error: err.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    const { session, user } = data;

    // Return Supabase's own session token
    res.json({
      token: session.access_token,
      user: {
        id: user.id,
        name: user.user_metadata?.user_name || "Unnamed",
        email: user.email,
        role: user.user_metadata?.role || "user",
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(400).json({ error: err.message || "Unknown error" });
  }
});

export default router;
