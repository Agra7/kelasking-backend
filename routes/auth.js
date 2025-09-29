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
    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Insert user
    const { error } = await supabase.from("User").insert([
      {
        user_name,
        email,
        password_hash: hashed,
        role,
      },
    ]);

    if (error) throw error;

    res.json({ message: "User registered!" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(400).json({ error: err.message || "Unknown error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    // Fetch user by email
    const { data: users, error } = await supabase
      .from("User")
      .select("*")
      .eq("email", email)
      .limit(1);

    if (error) throw error;

    const user = users[0];
    if (!user) return res.status(400).json({ error: "User not found" });

    // Compare password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(400).json({ error: "Invalid password" });

    // Generate JWT
    const token = jwt.sign(
      { id: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      token,
      user: {
        id: user.user_id,
        name: user.user_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(400).json({ error: err.message || "Unknown error" });
  }
});

export default router;
