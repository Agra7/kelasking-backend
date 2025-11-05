import express from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import authMiddleware from "../../middleware/authMiddleware.js";
import { requireRole } from "../../middleware/roleMiddleware.js";

dotenv.config();

const router = express.Router({ mergeParams: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Setup multer (upload image to memory)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg", 
      "image/png", 
      "image/gif",
      "application/pdf",
      "application/zip",
      "application/x-zip-compressed"
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only images, PDFs, and ZIP files are allowed"));
  },
});

// Helper function to check if user can modify project
async function canModifyProject(userId, userRole, projectId) {
  if (userRole === "admin" || userRole === "sales") return true;
  
  if (userRole === "PM") {
    const { data: project } = await supabase
      .from("Project")
      .select("pic")
      .eq("id", projectId)
      .single();
    
    return project && project.pic === userId;
  }
  
  return false;
}

// Helper function to check if user has access to project
async function hasProjectAccess(userId, userRole, projectId) {
  const { data: project } = await supabase
    .from("Project")
    .select("pic")
    .eq("id", projectId)
    .single();

  if (!project) return false;

  switch (userRole) {
    case "admin":
    case "sales":
      return true;
    
    case "PM":
      return project.pic === userId || project.pic === null;
    
    case "staff":
      const { data: projectUser } = await supabase
        .from("ProjectXUser")
        .select("*")
        .eq("ProjectID", projectId)
        .single();
      
      return projectUser && (
        projectUser.UserID_1 === userId ||
        projectUser.UserID_2 === userId ||
        projectUser.UserID_3 === userId
      );
    
    default:
      return false;
  }
}

/* =====================================================
   ✅ 1. GET all tasks for a project
   ===================================================== */
router.get("/", authMiddleware, async (req, res) => {
  const { projectId } = req.params;
  const { id: userId, role: userRole } = req.user;

  try {
    // Check if user has access to this project
    const hasAccess = await hasProjectAccess(userId, userRole, projectId);
    
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied to this project" });
    }

    const { data: tasks, error } = await supabase
      .from("Task")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ tasks: tasks || [] });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

/* =====================================================
   ✅ 2. GET single task
   ===================================================== */
router.get("/:taskId", authMiddleware, async (req, res) => {
  const { projectId, taskId } = req.params;
  const { id: userId, role: userRole } = req.user;

  try {
    // Check if user has access to this project
    const hasAccess = await hasProjectAccess(userId, userRole, projectId);
    
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied to this project" });
    }

    const { data, error } = await supabase
      .from("Task")
      .select("*")
      .eq("id", taskId)
      .eq("project_id", projectId)
      .single();

    if (error) throw error;
    res.json({ task: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* =====================================================
   ✅ 3. POST create new task
   Admin, Sales: can create on any project
   PM: can create only on projects they manage (PIC)
   Staff: CANNOT create tasks
   ===================================================== */
router.post("/", authMiddleware, async (req, res) => {
  const { projectId } = req.params;
  const { nama, deskripsi, deadline } = req.body;
  const { id: userId, role: userRole } = req.user;

  if (!nama) {
    return res.status(400).json({ error: "Task name (nama) is required" });
  }

  // Staff cannot create tasks
  if (userRole === "staff") {
    return res.status(403).json({ error: "Staff cannot create tasks" });
  }

  try {
    // Check if user can modify this project
    const canModify = await canModifyProject(userId, userRole, projectId);
    
    if (!canModify) {
      return res.status(403).json({ 
        error: "You don't have permission to create tasks on this project" 
      });
    }

    const { data, error } = await supabase
      .from("Task")
      .insert([{
        project_id: projectId,
        nama,
        deskripsi,
        status: "not_started",
        deadline
      }])
      .select();

    if (error) throw error;

    res.json({
      message: "Task created successfully",
      task: data[0],
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* =====================================================
   ✅ 4. PUT update task
   Admin, Sales, PM (PIC): can update
   Staff: CANNOT update directly (use file upload)
   ===================================================== */
router.put("/:taskId", authMiddleware, async (req, res) => {
  const { projectId, taskId } = req.params;
  const updates = req.body;
  const { id: userId, role: userRole } = req.user;

  // Staff cannot directly update tasks
  if (userRole === "staff") {
    return res.status(403).json({ 
      error: "Staff cannot update tasks directly. Upload a file to update progress." 
    });
  }

  try {
    // Check if user can modify this project
    const canModify = await canModifyProject(userId, userRole, projectId);
    
    if (!canModify) {
      return res.status(403).json({ 
        error: "You don't have permission to update tasks on this project" 
      });
    }

    const { data, error } = await supabase
      .from("Task")
      .update(updates)
      .eq("id", taskId)
      .eq("project_id", projectId)
      .select();

    if (error) throw error;
    
    if (!data || data.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ 
      message: "Task updated successfully", 
      task: data[0] 
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* =====================================================
   ✅ 5. POST upload file (STAFF ONLY)
   Automatically changes status to "waiting_for_verification"
   ===================================================== */
router.post("/:taskId/upload", authMiddleware, requireRole(["staff"]), upload.single("file"), async (req, res) => {
  try {
    const { taskId, projectId } = req.params;
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Verify staff is assigned to this project
    const { data: projectUser, error: pxuError } = await supabase
      .from("ProjectXUser")
      .select("*")
      .eq("ProjectID", projectId)
      .single();

    if (pxuError || !projectUser) {
      return res.status(403).json({ error: "You are not assigned to this project" });
    }

    const isAssigned = 
      projectUser.UserID_1 === userId ||
      projectUser.UserID_2 === userId ||
      projectUser.UserID_3 === userId;

    if (!isAssigned) {
      return res.status(403).json({ error: "You are not assigned to this project" });
    }

    // Generate unique filename
    const ext = req.file.originalname.split(".").pop();
    const fileName = `${Date.now()}_${req.file.originalname}`;
    const filePath = `projects/${projectId}/tasks/${taskId}/${fileName}`;

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

    // Update Task: set file_url and change status to "waiting_for_verification"
    const { data: task, error: updateError } = await supabase
      .from("Task")
      .update({ 
        file_url: fileUrl,
        status: "waiting_for_verification",
        uploaded_by: userId,
        uploaded_at: new Date().toISOString()
      })
      .eq("id", taskId)
      .eq("project_id", projectId)
      .select();

    if (updateError) throw updateError;

    res.json({
      message: "File uploaded successfully! Task is now waiting for PM verification.",
      file_url: fileUrl,
      task: task[0]
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

/* =====================================================
   ✅ 6. GET file info
   ===================================================== */
router.get("/:taskId/upload", authMiddleware, async (req, res) => {
  try {
    const { taskId, projectId } = req.params;

    const { data: task, error } = await supabase
      .from("Task")
      .select("file_url, uploaded_by, uploaded_at")
      .eq("id", taskId)
      .eq("project_id", projectId)
      .single();

    if (error) throw error;

    if (!task.file_url) {
      return res.json({ 
        message: "No file uploaded for this task",
        file_url: null 
      });
    }

    res.json({
      file_url: task.file_url,
      uploaded_by: task.uploaded_by,
      uploaded_at: task.uploaded_at
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* =====================================================
   ✅ 7. DELETE file (Admin or PM only)
   ===================================================== */
router.delete("/:taskId/upload", authMiddleware, requireRole(["admin", "PM"]), async (req, res) => {
  try {
    const { taskId, projectId } = req.params;
    const { id: userId, role: userRole } = req.user;

    // If PM, verify they are PIC
    if (userRole === "PM") {
      const { data: project } = await supabase
        .from("Project")
        .select("pic")
        .eq("id", projectId)
        .single();

      if (!project || project.pic !== userId) {
        return res.status(403).json({ 
          error: "Only the PIC can delete files from this project" 
        });
      }
    }

    // Get current file URL
    const { data: task, error: taskError } = await supabase
      .from("Task")
      .select("file_url")
      .eq("id", taskId)
      .eq("project_id", projectId)
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

    // Clear file_url from Task and reset status
    const { error: updateError } = await supabase
      .from("Task")
      .update({ 
        file_url: null,
        status: "in_progress",
        uploaded_by: null,
        uploaded_at: null
      })
      .eq("id", taskId)
      .eq("project_id", projectId);

    if (updateError) throw updateError;

    res.json({ message: "File deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

/* =====================================================
   ✅ 8. PUT verify task (PM or Admin only)
   PM verifies uploaded file and approves/rejects
   ===================================================== */
router.put("/:taskId/verify", authMiddleware, requireRole(["PM", "admin"]), async (req, res) => {
  const { projectId, taskId } = req.params;
  const { verified, feedback } = req.body;
  const { id: userId, role: userRole } = req.user;

  try {
    // If PM, check if they are PIC of this project
    if (userRole === "PM") {
      const { data: project } = await supabase
        .from("Project")
        .select("pic")
        .eq("id", projectId)
        .single();

      if (!project || project.pic !== userId) {
        return res.status(403).json({ 
          error: "Only the PIC can verify tasks on this project" 
        });
      }
    }

    // Update task status based on verification
    const newStatus = verified ? "done" : "revision_needed";
    
    const { data, error } = await supabase
      .from("Task")
      .update({ 
        status: newStatus,
        verified_at: verified ? new Date().toISOString() : null,
        verified_by: verified ? userId : null,
        feedback: feedback || null
      })
      .eq("id", taskId)
      .eq("project_id", projectId)
      .select();

    if (error) throw error;

    res.json({ 
      message: verified ? "Task verified and marked as done!" : "Task needs revision",
      task: data[0] 
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* =====================================================
   ✅ 9. DELETE task (ADMIN ONLY)
   ===================================================== */
router.delete("/:taskId", authMiddleware, requireRole(["admin"]), async (req, res) => {
  const { taskId, projectId } = req.params;

  try {
    // Delete file from storage if exists
    const { data: task } = await supabase
      .from("Task")
      .select("file_url")
      .eq("id", taskId)
      .single();

    if (task?.file_url) {
      const urlParts = task.file_url.split("/file_upload/");
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        await supabase.storage
          .from("file_upload")
          .remove([filePath]);
      }
    }

    // Delete task
    const { error } = await supabase
      .from("Task")
      .delete()
      .eq("id", taskId)
      .eq("project_id", projectId);

    if (error) throw error;

    res.json({ message: "Task deleted successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;