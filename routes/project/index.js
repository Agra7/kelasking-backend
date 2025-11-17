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
      .select(`*`)
      .eq("status", 'active');

    if (projectsError) throw projectsError;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Count active projects
    const activeProjects = allProjects.filter(p => 
      p.status === 'active' || p.status === 'ongoing'
    );

    // Count taken/accepted projects (has PIC assigned)
    const takenProjects = allProjects.filter(p => p.ID_pic !== null);

    // Count projects close to deadline (within 7 days)
    const closeToDeadline = allProjects.filter(p => {
      if (!p.deadline) return false;
      const deadline = new Date(p.deadline);
      const daysUntil = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= 2;
    });

    // Count projects past deadline
    const pastDeadline = allProjects.filter(p => {
      if (!p.deadline) return false;
      const deadline = new Date(p.deadline);
      return deadline < today && (p.status === 'active' || p.status === 'ongoing');
    });

    // Count finished projects
    // const finishedProjects = allProjects.filter(p => 
    //   p.status === 'completed' || p.status === 'finished'
    // );

    res.json({
      overview: {
        active_projects: activeProjects.length,
        taken_projects: takenProjects.length,
        close_to_deadline: closeToDeadline.length,
        past_deadline: pastDeadline.length
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
            id,
            po,
            client,
            deadline,
            status,
            PIC:Project_ID_pic_fkey ( user_nama ),
            Sales:Project_ID_sales_fkey ( user_nama ),
            ProjectXUser(UserID_PIC, UserID_1, UserID_2, UserID_3)
          `)
          .order("deadline", { ascending: true }); // urutkan deadline dari paling dekat;
        
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

      case "pm":
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
              ID_pic,
              deadline,
              status,
              ID_sales
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
// GET - Taken Projects List
// Shows all projects with PIC assigned (status: Taken)
// Admin & Sales: see all
// PM & Staff: see only ones they're involved in
// ============================================
router.get("/taken", authMiddleware, async (req, res) => {
  try {
    const { id: userId, role: userRole } = req.user;

    let query = supabase
      .from("Project")
      .select(`
        *,
        PIC:Project_ID_pic_fkey ( user_nama ),
        Sales:Project_ID_sales_fkey ( user_nama )
      `)
      .not("ID_pic", "is", null)
      .order("deadline", { ascending: true }); // urutkan deadline dari paling dekat

    // Filter based on role
    if (userRole === "pm") {
      // PM sees only projects where they are PIC
      query = query.eq("ID_pic", userId);
    } else if (userRole === "staff") {
      // Staff sees only projects they're assigned to
      // This requires joining through ProjectXUser
      const { data: staffProjects, error: staffError } = await supabase
        .from("ProjectXUser")
        .select(`
          Project:ProjectID (
            *
          )
        `)
        .or(
          `
          UserID_1.eq.${userId},UserID_2.eq.${userId},UserID_3.eq.${userId}
          `);

      if (staffError) throw staffError;

      const projects = staffProjects
        .map(item => item.Project)
        .filter(p => p !== null && p.pic !== null);

      return res.json({ projects });
    }

    // Admin & Sales see all taken projects
    const { data, error } = await query;
    if (error) throw error;

    res.json({ projects: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// GET - Available Projects List
// Shows all projects with no PIC (pic = null, status: Taken)
// All roles EXCEPT staff can see these
// ============================================
router.get("/available", authMiddleware, async (req, res) => {
  try {



    const { data, error } = await supabase
      .from("Project")
      .select(`
        *,
        PIC:Project_ID_pic_fkey ( user_nama ),
        Sales:Project_ID_sales_fkey ( user_nama )
        `)
      .is("ID_pic", null) // PIC is null
      .order("deadline", { ascending: true }); // urutkan deadline dari paling dekat

    if (error) throw error;

    res.json({ projects: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// GET - Active Projects List
// Shows all unfinished projects (status: Taken)
// Only Admin & Sales can see
// ============================================
// router.get("/active", authMiddleware, requireRole(["admin", "sales"]), async (req, res) => {
//   try {
//     const { data, error } = await supabase
//       .from("Project")
//       .select(`
//         *
//       `)
//       .eq("status", "Taken");

//     if (error) throw error;

//     res.json({ projects: data });
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// ============================================
// GET - History Projects List
// Shows all finished projects (status: Done)
// Only Admin can see
// ============================================
router.get("/history", authMiddleware, requireRole(["admin"]), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("Project")
      .select(`
        *
      `)
      .eq("status", "done");

    if (error) throw error;

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
      .select(`
         UserID_PIC:UserID_PIC(
      id,
      user_nama,
      jabatan
        ),
        UserID_1:UserID_1(
          id,
          user_nama,
          jabatan
        ),
        UserID_2:UserID_2(
          id,
          user_nama,
          jabatan
        ),
        UserID_3:UserID_3(
          id,
          user_nama,
          jabatan
        )
      `)
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
      
      case "pm":
        // PM can see if they are PIC or if no PIC assigned
        hasAccess = project.ID_pic === userId || project.ID_pic === null;
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
        team: projectUsers 
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
  let { po, client, deadline, status, nama_sales} = req.body;
  const userRole = req.user.role;
  
  if (!po || !client) {
    return res.status(400).json({ error: "PO and client are required" });
  }

  if (userRole == "sales") {
    // Sales can only assign themselves as nama_sales
    nama_sales = req.user.user_nama;
  }
  else{ 
    if (!nama_sales) {
    return res.status(400).json({ error: "nama sales is required" });
  }}

  // Get ID_sales from nama_sales
  const { data: ID_sales, error: salesError } = await supabase
    .from("User")
    .select("id")
    .eq("user_nama", nama_sales)
    .eq("role", "sales")
    .single();
  if (salesError) {
    return res.status(400).json({ error: "Nama sales tidak ditemukan" });
  }


  try {
    // Insert project
    const { data: project, error: projectError } = await supabase
      .from("Project")
      .insert([{ 
        po, 
        client, 
        ID_pic: ID_pic || null, // PIC can be null initially
        deadline, 
        status: status || "active", 
        ID_sales: ID_sales.id  // Default to creator if sales
      }])
      .select(`
        *,
        PIC:ID_pic ( user_nama ),
        Sales:ID_sales ( user_nama )
      `)
      .single();

    if (projectError) throw projectError;

    // Create ProjectXUser entry if PIC is assigned
    if (ID_pic) {
      const { error: pxuError } = await supabase
        .from("ProjectXUser")
        .insert([{
          ProjectID: project.id,
          UserID_PIC: ID_pic,
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
  const updates = req.body; // Can contain: po, client, pic, deadline, status, ID_sales

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
router.put("/:id/accept", authMiddleware, requireRole(["pm"]), async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Check if project exists and has no PIC
    const { data: project, error: checkError } = await supabase
      .from("Project")
      .select("ID_pic")
      .eq("id", id)
      .single();

    if (checkError) throw checkError;

    if (project.ID_pic !== null) {
      return res.status(400).json({ error: "Project sudah diambil" });
    }

    // Assign PM as PIC
    const { data, error } = await supabase
      .from("Project")
      .update({ ID_pic: userId })
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
  const { emailStaff } = req.body; // Array of up to 3 staff user IDs
  const userId = req.user.id;

  if (!Array.isArray(emailStaff) || emailStaff.length > 3) {
    return res.status(400).json({ error: "emailStaff must be an array with max 3 items" });
  }

  try {
    // Verify user is PIC of this project
    const { data: project, error: projectError } = await supabase
      .from("Project")
      .select("ID_pic")
      .eq("id", id)
      .single();

    if (projectError) throw projectError;
    
    if (project.ID_pic !== userId && req.user.role !== "admin") {
      return res.status(403).json({ error: "Only PIC or admin can assign staff" });
    }

    // Get user IDs for the provided staff emails
    const { data: staff_ids, error: staffError } = await supabase
      .from("User")
      .select("id")
      .in("email", emailStaff);
    if (staffError) throw staffError;

    
    const staffIdList = staff_ids.map(staff => staff.id);

    // Update ProjectXUser
    const { data: staffList, error } = await supabase
      .from("ProjectXUser")
      .update({
        UserID_1: staffIdList[0] || null,
        UserID_2: staffIdList[1] || null,
        UserID_3: staffIdList[2] || null
      })
      .eq("ProjectID", id)
       .select(`
          id,
          ProjectID,
          PIC:UserID_PIC ( id, user_nama, jabatan, email ),
          Staff1:UserID_1 ( id, user_nama, jabatan, email ),
          Staff2:UserID_2 ( id, user_nama, jabatan, email ),
          Staff3:UserID_3 ( id, user_nama, jabatan, email )
        `);

    if (error) throw error;


    // TODO: Send email invitations to assigned staff
    // You can implement this later using SendGrid, Mailgun, etc.

    res.json({ 
      message: "Staff assigned successfully!", 
      assigned_staff: staffList 
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