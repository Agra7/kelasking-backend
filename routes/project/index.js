import express from "express";
import supabase from "../../db.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import { requireRole } from "../../middleware/roleMiddleware.js";

const router = express.Router();

import taskRoutes from "./task.js";
router.use("/:projectId/tasks", taskRoutes);

// ============================================
// PROJECT OVERVIEW - Admin Only
// ============================================
router.get("/overview", authMiddleware, requireRole(["admin"]), async (req, res) => {
  try {
    // Get all projects with their details
    const { data: allProjects, error: projectsError } = await supabase
      .from("Project")
      .select(`
        *,
        ProjectXUser!inner(UserID_PIC)
      `);

    if (projectsError) throw projectsError;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Count active projects
    const activeProjects = allProjects.filter(p => 
      p.status === 'active' || p.status === 'ongoing'
    );

    // Count taken/accepted projects (has PIC assigned)
    const takenProjects = allProjects.filter(p => p.pic !== null);

    // Count projects close to deadline (within 7 days)
    const closeToDeadline = allProjects.filter(p => {
      if (!p.deadline) return false;
      const deadline = new Date(p.deadline);
      const daysUntil = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= 7;
    });

    // Count projects past deadline
    const pastDeadline = allProjects.filter(p => {
      if (!p.deadline) return false;
      const deadline = new Date(p.deadline);
      return deadline < today && (p.status === 'active' || p.status === 'ongoing');
    });

    // Count finished projects
    const finishedProjects = allProjects.filter(p => 
      p.status === 'completed' || p.status === 'finished'
    );

    // Get detailed lists
    const activeList = activeProjects.map(p => ({
      id: p.id,
      po: p.po,
      client: p.client,
      deadline: p.deadline,
      status: p.status,
      has_pic: p.pic !== null
    }));

    const closeToDeadlineList = closeToDeadline.map(p => {
      const deadline = new Date(p.deadline);
      const daysUntil = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
      return {
        id: p.id,
        po: p.po,
        client: p.client,
        deadline: p.deadline,
        days_until_deadline: daysUntil,
        pic: p.pic
      };
    });

    const pastDeadlineList = pastDeadline.map(p => {
      const deadline = new Date(p.deadline);
      const daysOverdue = Math.ceil((today - deadline) / (1000 * 60 * 60 * 24));
      return {
        id: p.id,
        po: p.po,
        client: p.client,
        deadline: p.deadline,
        days_overdue: daysOverdue,
        pic: p.pic
      };
    });

    res.json({
      overview: {
        total_projects: allProjects.length,
        active_projects: activeProjects.length,
        taken_projects: takenProjects.length,
        close_to_deadline: closeToDeadline.length,
        past_deadline: pastDeadline.length,
        finished_projects: finishedProjects.length
      },
      details: {
        active_projects: activeList,
        close_to_deadline: closeToDeadlineList,
        past_deadline: pastDeadlineList
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// GET - List projects (Role-based filtering)
// ============================================
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { id: userId, role: userRole } = req.user;
    const { status } = req.query; // Optional filter: ?status=active or ?status=finished

    let query;

    switch (userRole) {
      case "admin":
        // Admin: See all active projects and finished projects
        query = supabase
          .from("Project")
          .select(`
            *,
            ProjectXUser(UserID_PIC, UserID_1, UserID_2, UserID_3)
          `);
        
        if (status === 'active') {
          query = query.or("status.eq.active,status.eq.ongoing");
        } else if (status === 'finished') {
          query = query.or("status.eq.completed,status.eq.finished");
        }
        break;

      case "sales":
        // Sales: See active and taken/accepted projects
        query = supabase
          .from("Project")
          .select(`
            *,
            ProjectXUser(UserID_PIC, UserID_1, UserID_2, UserID_3)
          `)
          .or("status.eq.active,status.eq.ongoing")
          .not("pic", "is", null); // Has PIC (taken/accepted)
        break;

      case "PM":
        // PM: See projects taken by them + active projects without PIC
        query = supabase
          .from("Project")
          .select(`
            *,
            ProjectXUser(UserID_PIC, UserID_1, UserID_2, UserID_3)
          `)
          .or(`pic.eq.${userId},pic.is.null`)
          .or("status.eq.active,status.eq.ongoing");
        break;

      case "staff":
        // Staff: Only see projects they are assigned to
        query = supabase
          .from("ProjectXUser")
          .select(`
            Project:ProjectID (
              id,
              po,
              client,
              pic,
              deadline,
              status,
              nama_sales
            )
          `)
          .or(`UserID_1.eq.${userId},UserID_2.eq.${userId},UserID_3.eq.${userId}`);
        break;

      default:
        return res.status(403).json({ error: "Invalid role" });
    }

    const { data, error } = await query;
    if (error) throw error;

    // Format response for staff (extract Project from nested structure)
    if (userRole === "staff") {
      const projects = data.map(item => item.Project).filter(p => p !== null);
      return res.json({ projects });
    }

    res.json({ projects: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// GET - Get single project details
// ============================================
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { id: userId, role: userRole } = req.user;
    const projectId = req.params.id;

    // Get project
    const { data: project, error: projectError } = await supabase
      .from("Project")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError) throw projectError;

    // Get ProjectXUser data
    const { data: projectUsers, error: pxuError } = await supabase
      .from("ProjectXUser")
      .select("*")
      .eq("ProjectID", projectId)
      .single();

    if (pxuError && pxuError.code !== 'PGRST116') throw pxuError; // Ignore "not found" error

    // Check access based on role
    let hasAccess = false;

    switch (userRole) {
      case "admin":
        hasAccess = true; // Admin can see all
        break;
      
      case "sales":
        hasAccess = true; // Sales can see all projects
        break;
      
      case "PM":
        // PM can see if they are PIC or if no PIC assigned
        hasAccess = project.pic === userId || project.pic === null;
        break;
      
      case "staff":
        // Staff can see if they are assigned
        hasAccess = projectUsers && (
          projectUsers.UserID_1 === userId ||
          projectUsers.UserID_2 === userId ||
          projectUsers.UserID_3 === userId
        );
        break;
    }

    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied to this project" });
    }

    res.json({ 
      project: { 
        ...project, 
        users: projectUsers 
      } 
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// POST - Create project (Admin & Sales only)
// ============================================
router.post("/", authMiddleware, requireRole(["admin", "sales"]), async (req, res) => {
  const { po, client, deadline, status, nama_sales, pic } = req.body;
  
  if (!po || !client) {
    return res.status(400).json({ error: "PO and client are required" });
  }

  try {
    // Insert project
    const { data: project, error: projectError } = await supabase
      .from("Project")
      .insert([{ 
        po, 
        client, 
        pic: pic || null, // PIC can be null initially
        deadline, 
        status: status || "active", 
        nama_sales: nama_sales || req.user.id // Default to creator if sales
      }])
      .select()
      .single();

    if (projectError) throw projectError;

    // Create ProjectXUser entry if PIC is assigned
    if (pic) {
      const { error: pxuError } = await supabase
        .from("ProjectXUser")
        .insert([{
          ProjectID: project.id,
          UserID_PIC: pic,
          UserID_1: null,
          UserID_2: null,
          UserID_3: null
        }]);

      if (pxuError) throw pxuError;
    }

    res.json({ message: "Project created!", project });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// PUT - Update project (Admin & Sales only)
// ============================================
router.put("/:id", authMiddleware, requireRole(["admin", "sales"]), async (req, res) => {
  const { id } = req.params;
  const updates = req.body; // Can contain: po, client, pic, deadline, status, nama_sales

  try {
    const { data, error } = await supabase
      .from("Project")
      .update(updates)
      .eq("id", id)
      .select();

    if (error) throw error;
    
    if (!data || data.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({ message: "Project updated!", project: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// PUT - Assign/Accept Project (PM only)
// ============================================
router.put("/:id/accept", authMiddleware, requireRole(["PM"]), async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Check if project exists and has no PIC
    const { data: project, error: checkError } = await supabase
      .from("Project")
      .select("pic")
      .eq("id", id)
      .single();

    if (checkError) throw checkError;

    if (project.pic !== null) {
      return res.status(400).json({ error: "Project already has a PIC" });
    }

    // Assign PM as PIC
    const { data, error } = await supabase
      .from("Project")
      .update({ pic: userId })
      .eq("id", id)
      .select();

    if (error) throw error;

    // Create or update ProjectXUser
    const { data: existingPXU } = await supabase
      .from("ProjectXUser")
      .select("*")
      .eq("ProjectID", id)
      .single();

    if (existingPXU) {
      // Update existing
      await supabase
        .from("ProjectXUser")
        .update({ UserID_PIC: userId })
        .eq("ProjectID", id);
    } else {
      // Create new
      await supabase
        .from("ProjectXUser")
        .insert([{
          ProjectID: id,
          UserID_PIC: userId,
          UserID_1: null,
          UserID_2: null,
          UserID_3: null
        }]);
    }

    res.json({ message: "Project accepted!", project: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// PUT - Assign staff to project (PIC only)
// ============================================
router.put("/:id/assign-staff", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { staff_ids } = req.body; // Array of up to 3 staff user IDs
  const userId = req.user.id;

  if (!Array.isArray(staff_ids) || staff_ids.length > 3) {
    return res.status(400).json({ error: "staff_ids must be an array with max 3 items" });
  }

  try {
    // Verify user is PIC of this project
    const { data: project, error: projectError } = await supabase
      .from("Project")
      .select("pic")
      .eq("id", id)
      .single();

    if (projectError) throw projectError;
    
    if (project.pic !== userId && req.user.role !== "admin") {
      return res.status(403).json({ error: "Only PIC or admin can assign staff" });
    }

    // Update ProjectXUser
    const { data, error } = await supabase
      .from("ProjectXUser")
      .update({
        UserID_1: staff_ids[0] || null,
        UserID_2: staff_ids[1] || null,
        UserID_3: staff_ids[2] || null
      })
      .eq("ProjectID", id)
      .select();

    if (error) throw error;

    // TODO: Send email invitations to assigned staff
    // You can implement this later using SendGrid, Mailgun, etc.

    res.json({ 
      message: "Staff assigned successfully!", 
      assigned_staff: staff_ids 
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// DELETE - Delete project (Admin only)
// ============================================
router.delete("/:id", authMiddleware, requireRole(["admin"]), async (req, res) => {
  try {
    const { error } = await supabase
      .from("Project")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    
    res.json({ message: "Project deleted successfully." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;