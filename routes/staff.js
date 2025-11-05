import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import supabase from "../db.js";

const router = express.Router();

// Middleware: Verify Admin Token
async function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database to check role
    const { data: user, error } = await supabase
      .from("User")
      .select("*")
      .eq("id", decoded.id)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }
    
    if (user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// POST - Add staff (admin only)
router.post("/add", verifyAdmin, async (req, res) => {
  const { user_nama, email, password, role, jabatan, ttl, no_hp } = req.body;

  if (!user_nama || !email || !password || !role) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("User")
      .insert([{ user_nama, email, password_hash, role, jabatan, ttl, no_hp }])
      .select();

    if (error) throw error;

    res.json({
      message: "Staff added successfully!",
      staff: { 
        id: data[0].id, 
        email, 
        user_nama, 
        role 
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET - List all staff (admin only)
router.get("/", verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("User")
      .select("id, user_nama, email, role, jabatan, ttl, no_hp, image_url");

    if (error) throw error;

    res.json({ staff: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET - Get single staff member (admin only)
router.get("/:id", verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("User")
      .select("id, user_nama, email, role, jabatan, ttl, no_hp, image_url")
      .eq("id", req.params.id)
      .single();

    if (error) throw error;

    res.json({ staff: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT - Update staff (admin only)
router.put("/:id", verifyAdmin, async (req, res) => {
  const { user_nama, email, role, jabatan, ttl, no_hp } = req.body;

  try {
    const { data, error } = await supabase
      .from("User")
      .update({ user_nama, email, role, jabatan, ttl, no_hp })
      .eq("id", req.params.id)
      .select();

    if (error) throw error;

    res.json({
      message: "Staff updated successfully!",
      staff: data[0],
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE - Delete staff (admin only)
router.delete("/:id", verifyAdmin, async (req, res) => {
  try {
    const { error } = await supabase
      .from("User")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;

    res.json({ message: "Staff deleted successfully!" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;