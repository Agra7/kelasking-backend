import express from "express";
import supabase from "../../db.js";
import authMiddleware from "../../middleware/authMiddleware.js";

const router = express.Router({ mergeParams: true });

// Get all tasks for a project
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { data, error } = await supabase
      .from("Task")
      .select("*")
      .eq("project_id", projectId);

    if (error) throw error;
    res.json({ tasks: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

// Add task
router.post("/", authMiddleware, async (req, res) => {
  const { projectId } = req.params;
  const { task_name, description, assigned_to, status } = req.body;

  try {
    const { data, error } = await supabase
      .from("Task")
      .insert([
        {
          project_id: projectId,
          task_name,
          description,
          assigned_to,
          status: status || "pending",
        },
      ])
      .select();

    if (error) throw error;
    res.json({ message: "Task created!", task: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update Task
router.put("/:taskId", authMiddleware, async (req, res) => {
  const { projectId, taskId } = req.params;
  const updates = req.body;

  try {
    const { data, error } = await supabase
      .from("Task")
      .update(updates)
      .eq("task_id", taskId)
      .eq("project_id", projectId)
      .select();

    if (error) throw error;
    res.json({ message: "Task updated!", task: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete Task
router.delete("/:taskId", authMiddleware, async (req, res) => {
  const { projectId, taskId } = req.params;

  try {
    const { error } = await supabase
      .from("Task")
      .delete()
      .eq("task_id", taskId)
      .eq("project_id", projectId);

    if (error) throw error;
    res.json({ message: "Task deleted successfully!" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
