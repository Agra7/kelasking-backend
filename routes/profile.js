import express from "express";
import bcrypt from "bcryptjs";
import supabase from "../db.js";
import authMiddleware from "../middleware/authMiddleware.js";
import multer from "multer";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // supaya file ada di buffer



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

// PUT - Update user's profile
router.put("/:id", authMiddleware, async (req, res) => {
  const targetId = req.params.id;


  const { user_nama, email, jabatan, ttl, no_hp } = req.body;


  try {
    const updates = {};
    if (user_nama) updates.user_nama = user_nama;
    if (email) updates.email = email;
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

// GET - List all profiles
router.get("/", authMiddleware, async (req, res) => {
  try {
    let query = supabase
      .from("User")
      .select("id, user_nama, email, jabatan, ttl, no_hp, image_url");


    const { data, error } = await query;

    if (error) throw error;

    res.json({ profiles: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET - Get profiles by role
router.get("/role/:role", authMiddleware, async (req, res) => {
  try {


    const { role } = req.params;
    const validRoles = ["admin", "sales", "PM", "staff"];

    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const { data, error } = await supabase
      .from("User")
      .select("id, user_nama, email, jabatan, ttl, no_hp, image_url")
      .eq("role", role);

    if (error) throw error;

    res.json({ profiles: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT - Update profile image URL
router.put("/:id/image", authMiddleware, upload.single("image"), async (req, res) => {
  const targetId = req.params.id;
  const { role } = req.user;

  // Hanya admin yang boleh
  if (role !== "admin") {
    return res.status(403).json({ error: "Only admin can update images" });
  }

  try {
    // Ambil data user
    const { data: user, error: userError } = await supabase
      .from("User")
      .select("image_url")
      .eq("id", targetId)
      .single();

    if (userError) throw userError;

    let newImageUrl = user.image_url;

    // Jika belum ada foto dan admin upload file baru
    if ( req.file) {
      const file = req.file;
      const fileExt = file.originalname.split(".").pop();
      const fileName = `user_${targetId}_${Date.now()}.${fileExt}`;
      const filePath = `Uploaded/${fileName}`; // masuk ke folder uploaded/

    
      // Upload ke storage Supabase
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("Avatar") // bucket name = Avatar
        .upload(filePath, file.buffer, {
          cacheControl: "3600",
          upsert: true, // ganti file jika ada
          contentType: file.mimetype,
        });

       
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("Avatar")
        .getPublicUrl(`Uploaded/${fileName}`);

      newImageUrl = publicUrlData.publicUrl;
    }

    // Update image_url di database
    const { data, error } = await supabase
      .from("User")
      .update({ image_url: newImageUrl })
      .eq("id", targetId)
      .select("id, user_nama, email, jabatan, ttl, no_hp, image_url");

    if (error) throw error;

    res.json({
      message: "Profile image updated successfully",
      profile: data[0],
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;