import express from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import authMiddleware from "../../middleware/authMiddleware.js";

dotenv.config();
const router = express.Router({ mergeParams: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Store files in memory for direct upload to Supabase
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "application/pdf"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image and PDF files are allowed"));
  },
});

// POST - Upload file (updates Task with file_url)
router.post("/", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const ext = req.file.originalname.split(".").pop();
    const fileName = `${Date.now()}.${ext}`;
    const filePath = `Folder/Task/${taskId}/${fileName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("file_upload")
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: publicData } = supabase.storage
      .from("file_upload")
      .getPublicUrl(filePath);

    const fileUrl = publicData.publicUrl;

    // Update Task with file_url
    const { error: dbError } = await supabase
      .from("Task")
      .update({ file_url: fileUrl })
      .eq("id", taskId);

    if (dbError) throw dbError;

    res.json({
      message: "File uploaded successfully!",
      file_url: fileUrl,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// DELETE - Remove file from task
router.delete("/", authMiddleware, async (req, res) => {
  try {
    const { taskId } = req.params;

    // Get current file URL
    const { data: task, error: taskError } = await supabase
      .from("Task")
      .select("file_url")
      .eq("id", taskId)
      .single();

    if (taskError) throw taskError;

    if (task.file_url) {
      // Extract file path from URL
      const urlParts = task.file_url.split("/file_upload/");
      if (urlParts.length > 1) {
        const filePath = urlParts[1];

        // Delete from storage
        const { error: deleteError } = await supabase.storage
          .from("file_upload")
          .remove([filePath]);

        if (deleteError) console.error("Storage delete error:", deleteError);
      }
    }

    // Clear file_url from Task
    const { error: updateError } = await supabase
      .from("Task")
      .update({ file_url: null })
      .eq("id", taskId);

    if (updateError) throw updateError;

    res.json({ message: "File deleted successfully!" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

export default router;