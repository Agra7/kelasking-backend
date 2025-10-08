import express from "express";
import supabase from "../../db.js";
import authMiddleware from "../../middleware/authMiddleware.js";

const router = express.Router();

import taskRoutes from "./task.js";
router.use("/:projectId/tasks", taskRoutes);

// List all projects
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("Project")
      .select("*")
      .eq("created_by", req.user.id);

    if (error) throw error;
    res.json({ projects: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add project
router.post("/", authMiddleware, async (req, res) => {
  const { project_name, description, assigned_to } = req.body;
  try {
    const { data, error } = await supabase
      .from("Project")
      .insert([
        { created_by: req.user.id,
          project_name,
          description,
          assigned_to,
          status: "active" },
      ])
      .select();

    if (error) throw error;
    res.json({ message: "Project created!", project: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update project
router.put("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const { data, error } = await supabase
      .from("Project")
      .update(updates)
      .eq("project_id", id)
      .eq("created_by", req.user.id)
      .select();

    if (error) throw error;
    res.json({ message: "Project updated!", project: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete project
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("Project")
      .delete()
      .eq("project_id", req.params.id)
      .eq("created_by", req.user.id);

    if (error) throw error;
    res.json({ message: "Project deleted successfully." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


export default router;
