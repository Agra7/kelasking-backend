import express from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import authMiddleware from "../../middleware/authMiddleware.js";

dotenv.config();
const router = express.Router({mergeParams: true});

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
    const allowed = ["image/jpeg", "image/png", "image/gif"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// ✅ Upload file for a task
// POST /api/project/:projectId/tasks/:taskId/upload
router.post("/", authMiddleware, upload.single("file"), async (req, res) => {
    try {
      const { taskId } = req.params;
      const userId = req.user.id;

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Generate unique filename
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

      // Save file metadata to Supabase DB
      const { error: dbError } = await supabase.from("File").insert([
        {
          task_id: taskId,
          file_name: fileName,
          file_url: fileUrl,
          uploaded_by: userId,
        },
      ]);

      if (dbError) throw dbError;

      res.json({
        message: "File uploaded successfully!",
        file_url: fileUrl,
      });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  }
);


export default router;
