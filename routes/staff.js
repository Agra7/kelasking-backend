import express from "express";
import supabase from "../db.js";

const router = express.Router();

// Middleware: Verify Admin Token
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

// Add Staff
router.post("/add", verifyAdmin, async (req, res) => {
  const { name, email, password, role, phone_number, birth_date, origin } = req.body;

  if (!name || !email || !password || !role)
    return res.status(400).json({ error: "Missing required fields" });

  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { 
        user_name: name, 
        role,
        phone_number,
        birth_date,
        origin
      },
    });

    if (authError) throw authError;

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

// Change Password (Staff)
router.put("/change-password", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Missing token" });

  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password are required" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userData.user.email,
      password: currentPassword,
    });

    if (signInError) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const { data, error } = await supabase.auth.admin.updateUserById(
      userData.user.id,
      { password: newPassword }
    );

    if (error) throw error;

    res.json({
      message: "Password changed successfully! Please login again with your new password.",
    });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(400).json({ error: err.message });
  }
});

export default router;