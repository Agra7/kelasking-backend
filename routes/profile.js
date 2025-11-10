import express from "express";
import bcrypt from "bcryptjs";
import supabase from "../db.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// Helper function to check if user can view a profile
async function canViewProfile(viewerId, viewerRole, targetId) {
  // User can always view their own profile
  if (viewerId === targetId) return true;

  // Admin can view all profiles
  if (viewerRole === "admin") return true;

  // Get target user's role
  const { data: targetUser, error } = await supabase
    .from("User")
    .select("role")
    .eq("id", targetId)
    .single();

  if (error || !targetUser) return false;

  // Sales can only see their own profile (already checked above)
  if (viewerRole === "sales") return false;

  // PM can see their own and all staff profiles
  if (viewerRole === "PM") {
    return targetUser.role === "staff";
  }

  // Staff can see their own and PM profiles
  if (viewerRole === "staff") {
    return targetUser.role === "PM";
  }

  return false;
}

// GET - Get current user's profile
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("User")
      .select("id, user_nama, email, role, jabatan, ttl, no_hp, image_url")
      .eq("id", req.user.id)
      .single();

    if (error) throw error;

    res.json({ profile: user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT - Update current user's profile
router.put("/:id", authMiddleware, async (req, res) => {
  const targetId = req.params.id;
    const { id: viewerId, role: viewerRole } = req.user;

  // Check if viewer has permission to see this profile
  const hasPermission = await canViewProfile(viewerId, viewerRole, targetId);

  const { user_nama, jabatan, ttl, no_hp } = req.body;

  if (!hasPermission) {
      return res.status(403).json({ 
        error: "You don't have permission to update this profile" 
      });
    }

  try {
    const updates = {};
    if (user_nama) updates.user_nama = user_nama;
    if (jabatan) updates.jabatan = jabatan;
    if (ttl) updates.ttl = ttl;
    if (no_hp) updates.no_hp = no_hp;

    const { data, error } = await supabase
      .from("User")
      .update(updates)
      .eq("id", targetId)
      .select("id, user_nama, email, role, jabatan, ttl, no_hp, image_url");

    if (error) throw error;

    res.json({ 
      message: "Profile updated successfully", 
      profile: data[0] 
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET - List all viewable profiles based on role
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { id: userId, role: userRole } = req.user;
    let query = supabase
      .from("User")
      .select("id, user_nama, email, role, jabatan, ttl, no_hp, image_url");

    // Apply role-based filtering
    switch (userRole) {
      case "admin":
        // Admin can see all users - no filter needed
        break;
      
      case "sales":
        // Sales can only see their own profile
        query = query.eq("id", userId);
        break;
      
      case "PM":
        // PM can see their own and all staff profiles
        query = query.or(`id.eq.${userId},role.eq.staff`);
        break;
      
      case "staff":
        // Staff can see their own and PM profiles
        query = query.or(`id.eq.${userId},role.eq.PM`);
        break;
      
      default:
        // Unknown role - only show own profile
        query = query.eq("id", userId);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ profiles: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET - Get specific user's profile (with permission check)
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const targetId = req.params.id;
    const { id: viewerId, role: viewerRole } = req.user;

    // Check if viewer has permission to see this profile
    const hasPermission = await canViewProfile(viewerId, viewerRole, targetId);
    
    if (!hasPermission) {
      return res.status(403).json({ 
        error: "You don't have permission to view this profile" 
      });
    }

    // Get the profile
    const { data: user, error } = await supabase
      .from("User")
      .select("id, user_nama, email, role, jabatan, ttl, no_hp, image_url")
      .eq("id", targetId)
      .single();

    if (error) throw error;

    res.json({ profile: user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET - Get profiles by role (admin only)
router.get("/role/:role", authMiddleware, async (req, res) => {
  try {
    // Only admin can filter by role
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { role } = req.params;
    const validRoles = ["admin", "sales", "PM", "staff"];

    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const { data, error } = await supabase
      .from("User")
      .select("id, user_nama, email, role, jabatan, ttl, no_hp, image_url")
      .eq("role", role);

    if (error) throw error;

    res.json({ profiles: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT - Update profile image URL
router.put("/me/image", authMiddleware, async (req, res) => {
  const { image_url } = req.body;

  if (!image_url) {
    return res.status(400).json({ error: "Image URL is required" });
  }

  try {
    const { data, error } = await supabase
      .from("User")
      .update({ image_url })
      .eq("id", req.user.id)
      .select("id, user_nama, email, role, jabatan, ttl, no_hp, image_url");

    if (error) throw error;

    res.json({ 
      message: "Profile image updated successfully", 
      profile: data[0] 
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;