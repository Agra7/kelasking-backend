import express from "express";
import supabase from "../db.js";

const router = express.Router();

// --- Middleware: Verify Admin Token ---
async function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Missing token" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: "Invalid or expired token" });

  const role = data.user.user_metadata?.role;
  if (role !== "admin") return res.status(403).json({ error: "Admin access required" });

  req.user = data.user;
  next();
}

// --- POST /staff/add (Admin adds a new staff) ---
router.post("/add", verifyAdmin, async (req, res) => {
  const { name, email, password, role, phone_number, birth_date, origin } = req.body;

  if (!name || !email || !password || !role)
    return res.status(400).json({ error: "Missing required fields" });

  try {
    // Use admin.createUser instead of signUp
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Skip email verification since admin is creating
      user_metadata: { 
        user_name: name, 
        role,
        phone_number,
        birth_date,
        origin
      },
    });

    if (authError) throw authError;

    // Trigger will automatically create Staff record
    res.json({
      message: "Staff added successfully! They can now login and change their password.",
      staff: {
        id: authData.user.id,
        email,
        name,
        role,
      },
    });
  } catch (err) {
    console.error("Add staff error:", err);
    res.status(400).json({ error: err.message });
  }
});

export default router;